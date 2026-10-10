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
import { Venue } from '../src/models/venue.model.js';
import { Game } from '../src/models/game.model.js';
import { GameParticipant } from '../src/models/game-participant.model.js';
import { VenueStatuses } from '../src/constants/venue-constants.js';
import { config } from '../src/config/index.js';
import { Types } from 'mongoose';

async function createOnboardedUser(
  role = Roles.PLAYER,
  homeCoords: [number, number] = [80.27, 13.08],
  locationVisibility: 'public' | 'coarsened' | 'hidden' = 'coarsened',
) {
  const { user } = await createTestUser({ role });
  await Profile.create({
    user: user.id,
    displayName: 'Test User',
    bio: 'Bio',
    homeLocation: { type: 'Point', coordinates: homeCoords },
    travelRadiusKm: 30,
    availability: [],
    visibility: { profile: 'public', location: locationVisibility, ratings: 'public' },
    onboarding: {
      status: OnboardingStatuses.COMPLETED,
      completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'],
      completedAt: new Date(),
    },
  });
  const token = tokenService.generateAccessToken({ userId: user.id, role: user.role, email: user.email });
  return { user, token };
}

async function addSport(userId: string, sportId: Types.ObjectId) {
  await SportProfile.create({ user: userId, sport: sportId, selectedBandKey: 'intermediate', isActive: true });
}

async function createActiveVenueNearCoords(ownerId: string, coords: [number, number], sportKey: string) {
  return Venue.create({
    owner: new Types.ObjectId(ownerId),
    name: `Venue at ${coords}`,
    description: 'A venue for discovery tests',
    address: { line1: '1 Discovery St', city: 'Chennai' },
    areaLabel: 'Discovery Area',
    location: { type: 'Point', coordinates: coords },
    timezone: 'Asia/Kolkata',
    status: VenueStatuses.ACTIVE,
    weeklyHours: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openMinute: 0, closeMinute: 1440 })),
    closures: [],
    courts: [{ courtId: `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name: 'Court', sportKeys: [sportKey], isActive: true }],
    photoUrls: [],
    amenities: ['parking', 'lights'],
  });
}

describe('Module 5: Venue Discovery & Suggestions', () => {
  describe('GET /api/v1/venues (venue discovery)', () => {
    it('requires lat and lng query parameters', async () => {
      const res = await request(app).get('/api/v1/venues');
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns active venues within the radius', async () => {
      const { user: admin } = await createOnboardedUser(Roles.ADMIN);
      const sport = await createTestSport({ key: `discovery-sport-${Date.now()}`, name: 'Tennis' });
      await createActiveVenueNearCoords(admin.id, [80.27, 13.08], sport.key);
      await createActiveVenueNearCoords(admin.id, [80.27, 13.08], sport.key);

      const res = await request(app)
        .get('/api/v1/venues?lat=13.08&lng=80.27&radiusKm=5');

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    it('does NOT return pending venues to the public', async () => {
      const { user: admin } = await createOnboardedUser(Roles.ADMIN);

      const pendingVenue = await Venue.create({
        owner: new Types.ObjectId(admin.id),
        name: 'Pending Venue',
        description: 'Not yet active',
        address: { line1: '2 Pending St', city: 'Chennai' },
        areaLabel: 'Pending',
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        timezone: 'Asia/Kolkata',
        status: VenueStatuses.PENDING_APPROVAL,
        weeklyHours: [],
        closures: [],
        courts: [],
        photoUrls: [],
        amenities: [],
      });

      const res = await request(app)
        .get('/api/v1/venues?lat=13.08&lng=80.27&radiusKm=5');

      expect(res.status).toBe(HttpStatus.OK);
      const venueIds = res.body.data.items.map((i: any) => i.venue._id?.toString() || i.venue.id?.toString());
      expect(venueIds).not.toContain(pendingVenue._id.toString());
    });

    it('openAt filter: only venues open at that time returned', async () => {
      const { user: admin } = await createOnboardedUser(Roles.ADMIN);
      const sport = await createTestSport({ key: `openAt-sport-${Date.now()}`, name: 'Tennis' });

      // Venue open 8am-8pm UTC
      await Venue.create({
        owner: new Types.ObjectId(admin.id),
        name: 'Open Venue',
        description: 'Open during day',
        address: { line1: '3 Open St', city: 'Chennai' },
        areaLabel: 'Open Area',
        location: { type: 'Point', coordinates: [80.28, 13.09] },
        timezone: 'Asia/Kolkata',
        status: VenueStatuses.ACTIVE,
        weeklyHours: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openMinute: 480, closeMinute: 1200 })), // 8am-8pm
        closures: [],
        courts: [{ courtId: `co${Date.now()}`, name: 'Court', sportKeys: [sport.key], isActive: true }],
        photoUrls: [],
        amenities: [],
      });

      // openAt time during operating hours (10am UTC on a Monday)
      const openAtTime = '2027-01-04T10:00:00.000Z';
      const openRes = await request(app)
        .get(`/api/v1/venues?lat=13.09&lng=80.28&radiusKm=5&openAt=${encodeURIComponent(openAtTime)}`);

      expect(openRes.status).toBe(HttpStatus.OK);
      // At least the open venue should appear
      expect(openRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('sportKey filter returns only venues with that sport in an active court', async () => {
      const { user: admin } = await createOnboardedUser(Roles.ADMIN);
      const sport1 = await createTestSport({ key: `sport-filter-a-${Date.now()}`, name: 'Tennis' });
      const sport2 = await createTestSport({ key: `sport-filter-b-${Date.now()}`, name: 'Badminton' });

      await createActiveVenueNearCoords(admin.id, [80.27, 13.08], sport1.key);
      await createActiveVenueNearCoords(admin.id, [80.27, 13.08], sport2.key);

      const res = await request(app)
        .get(`/api/v1/venues?lat=13.08&lng=80.27&radiusKm=5&sportKey=${sport1.key}`);

      expect(res.status).toBe(HttpStatus.OK);
      for (const item of res.body.data.items) {
        const supportsSport = item.venue.courts?.some(
          (c: any) => c.isActive && c.sportKeys?.includes(sport1.key),
        );
        expect(supportsSport).toBe(true);
      }
    });

    it('cursor-based pagination: nextCursor present when hasMore=true', async () => {
      const { user: admin } = await createOnboardedUser(Roles.ADMIN);
      const sport = await createTestSport({ key: `page-sport-${Date.now()}`, name: 'Tennis' });

      // Create 5 venues near origin
      for (let i = 0; i < 5; i++) {
        await createActiveVenueNearCoords(admin.id, [80.27 + i * 0.001, 13.08], sport.key);
      }

      const res = await request(app)
        .get('/api/v1/venues?lat=13.08&lng=80.27&radiusKm=10&limit=3');

      expect(res.status).toBe(HttpStatus.OK);
      const pagination = res.body.data.pagination;
      if (pagination.hasMore) {
        expect(pagination.nextCursor).not.toBeNull();
        expect(typeof pagination.nextCursor).toBe('string');
      }
    });
  });

  describe('GET /api/v1/games/:id/venue-suggestions', () => {
    it('returns 400 when not enough non-host participants with visible locations', async () => {
      const { user: host, token: hostToken } = await createOnboardedUser();
      const sport = await createTestSport({ key: `sugg-sport-${Date.now()}`, name: 'Tennis' });
      await addSport(host.id, sport._id);

      const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

      const game = await Game.create({
        hostId: new Types.ObjectId(host.id),
        sportKey: sport.key,
        formatKey: 'singles',
        startsAt,
        endsAt,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: `SUGG${Date.now().toString(36).toUpperCase()}`,
        minPlayers: 2,
        maxPlayers: 6,
        participantCount: 1,
      });

      // No additional participants → suggestion request should fail
      const res = await request(app)
        .get(`/api/v1/games/${game._id}/venue-suggestions`)
        .set('Authorization', `Bearer ${hostToken}`);

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 403 when non-host requests suggestions', async () => {
      const { user: host } = await createOnboardedUser();
      const { user: other, token: otherToken } = await createOnboardedUser();
      const sport = await createTestSport({ key: `sugg-sport2-${Date.now()}`, name: 'Tennis' });
      await addSport(host.id, sport._id);

      const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const game = await Game.create({
        hostId: new Types.ObjectId(host.id),
        sportKey: sport.key,
        formatKey: 'singles',
        startsAt,
        endsAt,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: `NOHOST${Date.now().toString(36).toUpperCase()}`,
        minPlayers: 2,
        maxPlayers: 6,
        participantCount: 1,
      });

      const res = await request(app)
        .get(`/api/v1/games/${game._id}/venue-suggestions`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('returns sorted suggestions when enough participants are present', async () => {
      const minRequired = config.MIN_PARTICIPANTS_FOR_VENUE_SUGGESTION;
      const { user: host, token: hostToken } = await createOnboardedUser(Roles.PLAYER, [80.27, 13.08]);
      const sport = await createTestSport({ key: `sugg-sport3-${Date.now()}`, name: 'Tennis' });
      await addSport(host.id, sport._id);

      // Create active venue supporting the sport
      const { user: venueOwner } = await createOnboardedUser(Roles.ADMIN);
      const venue = await createActiveVenueNearCoords(venueOwner.id, [80.27, 13.08], sport.key);

      const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const game = await Game.create({
        hostId: new Types.ObjectId(host.id),
        sportKey: sport.key,
        formatKey: 'singles',
        startsAt,
        endsAt,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: `FULL${Date.now().toString(36).toUpperCase()}`,
        minPlayers: 2,
        maxPlayers: 10,
        participantCount: 1,
      });

      // Add minRequired participants with visible home locations (excluding host)
      for (let i = 0; i < minRequired; i++) {
        const { user: p } = await createOnboardedUser(Roles.PLAYER, [80.27 + i * 0.01, 13.08 + i * 0.01], 'coarsened');
        await addSport(p.id, sport._id);
        await GameParticipant.create({
          gameId: game._id,
          userId: new Types.ObjectId(p.id),
          role: 'player',
          status: 'joined',
          startsAt,
          endsAt,
          joinedAt: new Date(),
        });
      }

      const res = await request(app)
        .get(`/api/v1/games/${game._id}/venue-suggestions`)
        .set('Authorization', `Bearer ${hostToken}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Centroid should NOT be in the response
      for (const item of res.body.data) {
        expect(item.centroid).toBeUndefined();
        expect(item.venue).toBeDefined();
        expect(item.averageDistanceKm).toBeDefined();
      }

      // Should be sorted by averageDistanceKm ascending
      const dists = res.body.data.map((s: any) => s.averageDistanceKm);
      for (let i = 1; i < dists.length; i++) {
        expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1]);
      }
    });

    it('participants with location=hidden are excluded from centroid computation', async () => {
      const minRequired = config.MIN_PARTICIPANTS_FOR_VENUE_SUGGESTION;
      const { user: host, token: hostToken } = await createOnboardedUser(Roles.PLAYER, [80.27, 13.08]);
      const sport = await createTestSport({ key: `sugg-hidden-${Date.now()}`, name: 'Tennis' });
      await addSport(host.id, sport._id);

      const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const game = await Game.create({
        hostId: new Types.ObjectId(host.id),
        sportKey: sport.key,
        formatKey: 'singles',
        startsAt,
        endsAt,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: `HIDDEN${Date.now().toString(36).toUpperCase()}`,
        minPlayers: 2,
        maxPlayers: 10,
        participantCount: 1,
      });

      // Add one participant with hidden location — they should NOT count toward centroid
      const { user: hiddenP } = await createOnboardedUser(Roles.PLAYER, [80.27, 13.08], 'hidden');
      await addSport(hiddenP.id, sport._id);
      await GameParticipant.create({
        gameId: game._id,
        userId: new Types.ObjectId(hiddenP.id),
        role: 'player',
        status: 'joined',
        startsAt,
        endsAt,
        joinedAt: new Date(),
      });

      // Only one hidden participant (below minimum), so should return 400
      const res = await request(app)
        .get(`/api/v1/games/${game._id}/venue-suggestions`)
        .set('Authorization', `Bearer ${hostToken}`);

      // Should fail because hidden participant doesn't count — only 0 valid coords
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
