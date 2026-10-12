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
import { CourtGuard } from '../src/models/court-guard.model.js';
import { Game } from '../src/models/game.model.js';
import { GameEvent } from '../src/models/game-event.model.js';
import { VenueStatuses, VenueEventTypes } from '../src/constants/venue-constants.js';
import { JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { domainEvents } from '../src/utils/domain-events.js';
import { Types } from 'mongoose';

async function createOnboardedPlayer(role = Roles.PLAYER) {
  const { user } = await createTestUser({ role });
  const sport = await createTestSport({ key: `sport-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: 'Tennis' });
  await Profile.create({
    user: user.id,
    displayName: 'Player',
    bio: 'Bio',
    homeLocation: { type: 'Point', coordinates: [80.27, 13.08] },
    travelRadiusKm: 20,
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

async function setupVenueWithCourt(ownerId: string, sportKey: string) {
  const courtId = `c${Date.now().toString(36)}`;
  const venue = await Venue.create({
    owner: new Types.ObjectId(ownerId),
    name: 'Linking Venue',
    description: 'Venue for game linking tests',
    address: { line1: '1 Link St', city: 'Chennai' },
    areaLabel: 'Link Area',
    location: { type: 'Point', coordinates: [80.27, 13.08] },
    timezone: 'Asia/Kolkata',
    status: VenueStatuses.ACTIVE,
    weeklyHours: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openMinute: 0, closeMinute: 1440 })),
    closures: [],
    courts: [{ courtId, name: 'Main Court', sportKeys: [sportKey], isActive: true }],
    photoUrls: [],
    amenities: [],
  });
  await CourtGuard.create({ venueId: venue._id, courtId, version: 1 });
  return { venue, courtId };
}

describe('Module 5: Game–Venue Linking', () => {
  describe('Create game with venueId', () => {
    it('creates game linked to venue — uses venue location, courtId stored', async () => {
      const { user, token, sport } = await createOnboardedPlayer();
      const { venue, courtId } = await setupVenueWithCourt(user.id, sport.key);

      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sportKey: sport.key,
          formatKey: 'singles',
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          venueId: venue._id.toString(),
          courtId,
          joinPolicy: JoinPolicies.OPEN,
          visibility: GameVisibilities.PUBLIC,
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.id).toBeDefined();

      // Check DB: game has venue and courtId set
      const gameInDb = await Game.findById(res.body.data.id);
      expect(gameInDb?.venue?.toString()).toBe(venue._id.toString());
      expect(gameInDb?.courtId).toBe(courtId);
    });
  });

  describe('Create game with freeform location', () => {
    it('creates game with only freeform location (no venueId)', async () => {
      const { user, token, sport } = await createOnboardedPlayer();

      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sportKey: sport.key,
          formatKey: 'singles',
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          location: { type: 'Point', coordinates: [80.27, 13.08], addressName: 'Public Park' },
          joinPolicy: JoinPolicies.OPEN,
          visibility: GameVisibilities.PUBLIC,
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      const gameInDb = await Game.findById(res.body.data.id);
      expect(gameInDb?.venue).toBeUndefined();
    });
  });

  describe('Validation: neither location nor venueId → 400', () => {
    it('returns 400 when no location and no venueId provided', async () => {
      const { token, sport } = await createOnboardedPlayer();

      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sportKey: sport.key,
          formatKey: 'singles',
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          joinPolicy: JoinPolicies.OPEN,
          visibility: GameVisibilities.PUBLIC,
          // No location, no venueId
        });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Update game from freeform to venue', () => {
    it('emits game.venue.changed event when updating venue', async () => {
      const { user, token, sport } = await createOnboardedPlayer();
      const { venue, courtId } = await setupVenueWithCourt(user.id, sport.key);

      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

      // Create freeform game
      const createRes = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sportKey: sport.key,
          formatKey: 'singles',
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          location: { type: 'Point', coordinates: [80.27, 13.08] },
          joinPolicy: JoinPolicies.OPEN,
          visibility: GameVisibilities.PUBLIC,
        });
      expect(createRes.status).toBe(HttpStatus.CREATED);
      const gameId = createRes.body.data.id;

      // Set up domain event listener
      let domainEventEmitted = false;
      const listener = (evt: any) => {
        if (evt.type === VenueEventTypes.GAME_VENUE_CHANGED && evt.gameId === gameId.toString()) {
          domainEventEmitted = true;
        }
      };
      domainEvents.on(VenueEventTypes.GAME_VENUE_CHANGED, listener);

      try {
        // Update to link to venue
        const updateRes = await request(app)
          .patch(`/api/v1/games/${gameId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ venueId: venue._id.toString(), courtId });

        expect(updateRes.status).toBe(HttpStatus.OK);
        expect(domainEventEmitted).toBe(true);
      } finally {
        domainEvents.off(VenueEventTypes.GAME_VENUE_CHANGED, listener);
      }
    });
  });

  describe('Court unavailable (closed)', () => {
    it('returns error when booking a court during a venue closure', async () => {
      const { user, token, sport } = await createOnboardedPlayer();
      const { venue, courtId } = await setupVenueWithCourt(user.id, sport.key);

      // Add a closure covering our booking time
      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

      // Directly add closure to venue to cover the game time
      await Venue.findByIdAndUpdate(venue._id, {
        $push: {
          closures: {
            closureId: 'cl001',
            startsAt: new Date(startsAt.getTime() - 30 * 60 * 1000),
            endsAt: new Date(endsAt.getTime() + 30 * 60 * 1000),
            reason: 'Emergency maintenance',
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sportKey: sport.key,
          formatKey: 'singles',
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          venueId: venue._id.toString(),
          courtId,
          joinPolicy: JoinPolicies.OPEN,
          visibility: GameVisibilities.PUBLIC,
        });

      expect(res.status).toBe(HttpStatus.CONFLICT);
    });
  });
});
