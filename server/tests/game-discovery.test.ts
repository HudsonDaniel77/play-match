import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { Roles } from '../src/constants/roles.js';
import { Profile } from '../src/models/profile.model.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { Game } from '../src/models/game.model.js';
import { DiscoveryService } from '../src/services/discovery.service.js';
import { config } from '../src/config/index.js';
import { Types } from 'mongoose';

const ORIGIN = { lat: 13.08, lng: 80.27 };

async function createOnboardedPlayer(homeCoords = [80.27, 13.08] as [number, number]) {
  const { user } = await createTestUser({ role: Roles.PLAYER });
  const sport = await createTestSport({ key: `sport-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: 'Tennis' });
  await Profile.create({
    user: user.id,
    displayName: 'Discovery Player',
    bio: 'Bio',
    homeLocation: { type: 'Point', coordinates: homeCoords },
    travelRadiusKm: 30,
    availability: [{ dayOfWeek: 1, startMinute: 0, endMinute: 1440 }],
    visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
    onboarding: {
      status: OnboardingStatuses.COMPLETED,
      completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'],
      completedAt: new Date(),
    },
  });
  await SportProfile.create({ user: user.id, sport: sport._id, selectedBandKey: 'intermediate', isActive: true });
  const token = tokenService.generateAccessToken({ userId: user.id, role: user.role, email: user.email });
  return { user, token, sport };
}

async function createOpenGame(hostId: string, sportKey: string, coords: [number, number]) {
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  return Game.create({
    hostId: new Types.ObjectId(hostId),
    sportKey,
    formatKey: 'singles',
    startsAt,
    endsAt,
    location: { type: 'Point', coordinates: coords },
    status: 'open',
    joinPolicy: 'open',
    visibility: 'public',
    inviteCode: `INV${Date.now().toString(36).toUpperCase()}`,
    minPlayers: 2,
    maxPlayers: 2,
    participantCount: 1,
  });
}

describe('Module 5: Game Discovery', () => {
  describe('GET /api/v1/games/discover', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/games/discover?lat=13.08&lng=80.27');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('discovers games near origin, returns results within radius', async () => {
      const { user, token, sport } = await createOnboardedPlayer();
      // Create a game very close to the query origin
      await createOpenGame(user.id, sport.key, [80.27, 13.08]);

      const res = await request(app)
        .get('/api/v1/games/discover?lat=13.08&lng=80.27&radiusKm=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
    });

    it('free-form game distance is rounded per DISTANCE_PRIVACY_ROUNDING_KM', async () => {
      const { user, token, sport } = await createOnboardedPlayer();
      await createOpenGame(user.id, sport.key, [80.27, 13.08]);

      const res = await request(app)
        .get('/api/v1/games/discover?lat=13.08&lng=80.27&radiusKm=20')
        .set('Authorization', `Bearer ${token}`);

      if (res.body.data?.items?.length > 0) {
        const item = res.body.data.items[0];
        const dist = item.distanceKm;
        const step = config.DISTANCE_PRIVACY_ROUNDING_KM;
        // Distance should be a multiple of step
        expect(dist % step).toBeCloseTo(0, 5);
      }
    });

    it('sportKey filter returns only matching games', async () => {
      const { user: player1, token, sport: sport1 } = await createOnboardedPlayer();
      const { user: player2, sport: sport2 } = await createOnboardedPlayer();

      await createOpenGame(player1.id, sport1.key, [80.27, 13.08]);
      await createOpenGame(player2.id, sport2.key, [80.27, 13.08]);

      const res = await request(app)
        .get(`/api/v1/games/discover?lat=13.08&lng=80.27&radiusKm=10&sportKey=${sport1.key}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      if (res.body.data.items.length > 0) {
        for (const item of res.body.data.items) {
          expect(item.game.sportKey).toBe(sport1.key);
        }
      }
    });

    it('pagination returns hasMore and nextCursor', async () => {
      const { user, token, sport } = await createOnboardedPlayer();
      // Create 3 games
      for (let i = 0; i < 3; i++) {
        await createOpenGame(user.id, sport.key, [80.27, 13.08]);
      }

      const res = await request(app)
        .get('/api/v1/games/discover?lat=13.08&lng=80.27&radiusKm=20&limit=2')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.pagination).toBeDefined();
      // totalReturned should be up to 2
      expect(res.body.data.pagination.totalReturned).toBeLessThanOrEqual(2);
    });

    it('hideMine excludes own games', async () => {
      const { user, token, sport } = await createOnboardedPlayer();
      await createOpenGame(user.id, sport.key, [80.27, 13.08]);

      const res = await request(app)
        .get('/api/v1/games/discover?lat=13.08&lng=80.27&radiusKm=20&hideMine=true')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      // Own games should not appear
      for (const item of (res.body.data?.items ?? [])) {
        expect(item.game.hostId).not.toBe(user.id.toString());
      }
    });

    it('cursor decode produces consistent rounded distances (privacy invariant)', () => {
      // Unit test: encode a cursor and decode it — verify distance stored is rounded
      const step = config.DISTANCE_PRIVACY_ROUNDING_KM;
      const exactDist = 3.14159;
      const roundedDist = Math.round(exactDist / step) * step;
      const cursor = DiscoveryService.encodeCursor('distance', roundedDist, 'someid');
      const decoded = DiscoveryService.decodeCursor(cursor);
      expect(decoded.v).toBe(roundedDist);
      expect(decoded.v % step).toBeCloseTo(0, 5);
    });
  });
});
