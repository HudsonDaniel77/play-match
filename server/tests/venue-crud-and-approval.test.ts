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
import { GameEvent } from '../src/models/game-event.model.js';
import { Game } from '../src/models/game.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { VenueEventTypes, VenueStatuses } from '../src/constants/venue-constants.js';
import { JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { domainEvents } from '../src/utils/domain-events.js';

async function createOnboardedUser(role = Roles.PLAYER) {
  const { user } = await createTestUser({ role });
  const token = tokenService.generateAccessToken({ userId: user.id, role: user.role, email: user.email });
  await Profile.create({
    user: user.id,
    displayName: 'Test User',
    bio: 'Bio',
    homeLocation: { type: 'Point', coordinates: [80.27, 13.08] },
    travelRadiusKm: 15,
    availability: [{ dayOfWeek: 1, startMinute: 600, endMinute: 720 }],
    visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
    onboarding: {
      status: OnboardingStatuses.COMPLETED,
      completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'],
      completedAt: new Date(),
    },
  });
  return { user, token };
}

async function createOnboardedUserWithSport(role = Roles.PLAYER) {
  const sport = await createTestSport({ key: 'badminton', name: 'Badminton' });
  const { user, token } = await createOnboardedUser(role);
  await SportProfile.create({ user: user.id, sport: sport._id, selectedBandKey: 'intermediate', isActive: true });
  return { user, token, sport };
}

const VENUE_BODY = {
  name: 'Test Sports Arena',
  description: 'A great venue for sports',
  address: { line1: '1 Main Street', city: 'Chennai', state: 'Tamil Nadu' },
  areaLabel: 'Central Chennai',
  location: { type: 'Point', coordinates: [80.27, 13.08] },
  timezone: 'Asia/Kolkata',
};

describe('Module 5: Venue CRUD & Approval', () => {
  describe('POST /api/v1/venues', () => {
    it('venue_owner with onboarding can create a venue', async () => {
      const { token } = await createOnboardedUser(Roles.VENUE_OWNER);
      const res = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${token}`)
        .send(VENUE_BODY);

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Sports Arena');
      expect(res.body.data.status).toBe(VenueStatuses.PENDING_APPROVAL);
    });

    it('admin can create a venue (auto-approved)', async () => {
      const { token } = await createOnboardedUser(Roles.ADMIN);
      const res = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${token}`)
        .send(VENUE_BODY);

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.status).toBe(VenueStatuses.ACTIVE);
    });

    it('player cannot create a venue (403 forbidden)', async () => {
      const { token } = await createOnboardedUser(Roles.PLAYER);
      const res = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${token}`)
        .send(VENUE_BODY);

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('unauthenticated request cannot create a venue (401)', async () => {
      const res = await request(app).post('/api/v1/venues').send(VENUE_BODY);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /api/v1/venues/:id', () => {
    it('owner can see their own pending venue', async () => {
      const { user, token } = await createOnboardedUser(Roles.VENUE_OWNER);
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${token}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      const res = await request(app)
        .get(`/api/v1/venues/${venueId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.status).toBe(VenueStatuses.PENDING_APPROVAL);
    });

    it('public cannot see pending venue (404)', async () => {
      const { token } = await createOnboardedUser(Roles.VENUE_OWNER);
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${token}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      const res = await request(app).get(`/api/v1/venues/${venueId}`);
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('public can see active venue', async () => {
      const { token: adminToken } = await createOnboardedUser(Roles.ADMIN);
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      const res = await request(app).get(`/api/v1/venues/${venueId}`);
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.status).toBe(VenueStatuses.ACTIVE);
    });
  });

  describe('Admin lifecycle — approve / suspend / reinstate', () => {
    it('admin approves a pending venue → status becomes active, domain event emitted', async () => {
      const { token: ownerToken } = await createOnboardedUser(Roles.VENUE_OWNER);
      const { user: admin, token: adminToken } = await createOnboardedUser(Roles.ADMIN);

      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      let eventEmitted = false;
      const listener = (evt: any) => {
        if (evt.type === VenueEventTypes.VENUE_APPROVED && evt.data?.venueId === venueId) {
          eventEmitted = true;
        }
      };
      domainEvents.on(VenueEventTypes.VENUE_APPROVED, listener);

      try {
        const approveRes = await request(app)
          .post(`/api/v1/venues/${venueId}/approve`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(approveRes.status).toBe(HttpStatus.OK);
        expect(approveRes.body.data.status).toBe(VenueStatuses.ACTIVE);
        expect(eventEmitted).toBe(true);
      } finally {
        domainEvents.off(VenueEventTypes.VENUE_APPROVED, listener);
      }
    });

    it('admin suspends active venue → domain event emitted', async () => {
      const { token: adminToken } = await createOnboardedUser(Roles.ADMIN);
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      let eventEmitted = false;
      const listener = (evt: any) => {
        if (evt.type === VenueEventTypes.VENUE_SUSPENDED && evt.data?.venueId === venueId) {
          eventEmitted = true;
        }
      };
      domainEvents.on(VenueEventTypes.VENUE_SUSPENDED, listener);

      try {
        const suspendRes = await request(app)
          .post(`/api/v1/venues/${venueId}/suspend`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(suspendRes.status).toBe(HttpStatus.OK);
        expect(suspendRes.body.data.status).toBe(VenueStatuses.SUSPENDED);
        expect(eventEmitted).toBe(true);
      } finally {
        domainEvents.off(VenueEventTypes.VENUE_SUSPENDED, listener);
      }
    });

    it('admin reinstates suspended venue → domain event emitted', async () => {
      const { token: adminToken } = await createOnboardedUser(Roles.ADMIN);
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      await request(app)
        .post(`/api/v1/venues/${venueId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`);

      let eventEmitted = false;
      const listener = (evt: any) => {
        if (evt.type === VenueEventTypes.VENUE_REINSTATED && evt.data?.venueId === venueId) {
          eventEmitted = true;
        }
      };
      domainEvents.on(VenueEventTypes.VENUE_REINSTATED, listener);

      try {
        const reinstateRes = await request(app)
          .post(`/api/v1/venues/${venueId}/reinstate`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(reinstateRes.status).toBe(HttpStatus.OK);
        expect(reinstateRes.body.data.status).toBe(VenueStatuses.ACTIVE);
        expect(eventEmitted).toBe(true);
      } finally {
        domainEvents.off(VenueEventTypes.VENUE_REINSTATED, listener);
      }
    });

    it('non-admin cannot approve a venue (403)', async () => {
      const { token: ownerToken } = await createOnboardedUser(Roles.VENUE_OWNER);
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      const res = await request(app)
        .post(`/api/v1/venues/${venueId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('PATCH /api/v1/venues/:id', () => {
    it('owner can update venue name', async () => {
      const { token: ownerToken } = await createOnboardedUser(Roles.VENUE_OWNER);
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      const updateRes = await request(app)
        .patch(`/api/v1/venues/${venueId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Updated Arena' });

      expect(updateRes.status).toBe(HttpStatus.OK);
      expect(updateRes.body.data.name).toBe('Updated Arena');
    });

    it('non-owner cannot update venue (403)', async () => {
      const { token: ownerToken } = await createOnboardedUser(Roles.VENUE_OWNER);
      const { token: otherToken } = await createOnboardedUser(Roles.VENUE_OWNER);

      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;

      const res = await request(app)
        .patch(`/api/v1/venues/${venueId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('updating location is blocked when upcoming games exist (without adminOverride)', async () => {
      const { user: owner, token: ownerToken } = await createOnboardedUserWithSport(Roles.VENUE_OWNER);
      const { token: adminToken } = await createOnboardedUser(Roles.ADMIN);

      // Create and approve venue
      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;
      await request(app)
        .post(`/api/v1/venues/${venueId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Create game linked to venue
      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      await Game.create({
        hostId: owner.id,
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt,
        endsAt,
        venue: venueId,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: 'TESTCODE1',
        minPlayers: 2,
        maxPlayers: 2,
        participantCount: 1,
      });

      const updateRes = await request(app)
        .patch(`/api/v1/venues/${venueId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ location: { type: 'Point', coordinates: [80.30, 13.10] } });

      expect(updateRes.status).toBe(HttpStatus.CONFLICT);
    });

    it('admin can force location update with adminOverride + reason', async () => {
      const { user: owner, token: ownerToken } = await createOnboardedUserWithSport(Roles.VENUE_OWNER);
      const { token: adminToken } = await createOnboardedUser(Roles.ADMIN);

      const createRes = await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(VENUE_BODY);
      const venueId = createRes.body.data._id;
      await request(app)
        .post(`/api/v1/venues/${venueId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      await Game.create({
        hostId: owner.id,
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt,
        endsAt,
        venue: venueId,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: 'TESTCODE2',
        minPlayers: 2,
        maxPlayers: 2,
        participantCount: 1,
      });

      const updateRes = await request(app)
        .patch(`/api/v1/venues/${venueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          location: { type: 'Point', coordinates: [80.30, 13.10] },
          adminOverride: true,
          overrideReason: 'Venue relocation approved',
        });

      expect(updateRes.status).toBe(HttpStatus.OK);
      expect(updateRes.body.data.location.coordinates).toEqual([80.30, 13.10]);
    });
  });

  describe('GET /api/v1/venues/mine', () => {
    it('returns venues owned by the authenticated user', async () => {
      const { token } = await createOnboardedUser(Roles.VENUE_OWNER);
      await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${token}`)
        .send(VENUE_BODY);
      await request(app)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VENUE_BODY, name: 'Second Arena' });

      const res = await request(app)
        .get('/api/v1/venues/mine')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.venues).toHaveLength(2);
    });
  });
});
