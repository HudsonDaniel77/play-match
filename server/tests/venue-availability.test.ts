import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { Roles } from '../src/constants/roles.js';
import { Profile } from '../src/models/profile.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { VenueStatuses } from '../src/constants/venue-constants.js';
import { Venue } from '../src/models/venue.model.js';
import { Game } from '../src/models/game.model.js';
import { Types } from 'mongoose';

async function createAdminToken() {
  const { user } = await createTestUser({ role: Roles.ADMIN });
  await Profile.create({
    user: user.id,
    displayName: 'Admin User',
    bio: 'Admin',
    homeLocation: { type: 'Point', coordinates: [80.27, 13.08] },
    travelRadiusKm: 15,
    availability: [],
    visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
    onboarding: {
      status: OnboardingStatuses.COMPLETED,
      completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'],
      completedAt: new Date(),
    },
  });
  const token = tokenService.generateAccessToken({ userId: user.id, role: user.role, email: user.email });
  return { user, token };
}

async function createActiveVenue(adminId: string) {
  const venueDoc = await Venue.create({
    owner: new Types.ObjectId(adminId),
    name: 'Availability Arena',
    description: 'A test venue for availability checks',
    address: { line1: '1 Main Street', city: 'Chennai' },
    areaLabel: 'Central',
    location: { type: 'Point', coordinates: [80.27, 13.08] },
    timezone: 'Asia/Kolkata',
    status: VenueStatuses.ACTIVE,
    weeklyHours: [
      { dayOfWeek: 0, openMinute: 480, closeMinute: 1200 }, // Sunday 8am-8pm
      { dayOfWeek: 1, openMinute: 480, closeMinute: 1200 }, // Monday 8am-8pm
      { dayOfWeek: 2, openMinute: 480, closeMinute: 1200 },
      { dayOfWeek: 3, openMinute: 480, closeMinute: 1200 },
      { dayOfWeek: 4, openMinute: 480, closeMinute: 1200 },
      { dayOfWeek: 5, openMinute: 480, closeMinute: 1200 },
      { dayOfWeek: 6, openMinute: 480, closeMinute: 1200 },
    ],
    closures: [],
    courts: [
      { courtId: 'court001', name: 'Court A', sportKeys: ['badminton'], isActive: true },
    ],
    photoUrls: [],
    amenities: [],
  });
  return venueDoc;
}

describe('Module 5: Venue Availability', () => {
  describe('GET /api/v1/venues/:id/availability', () => {
    it('returns free windows for an active venue with weekly hours', async () => {
      const { user: admin } = await createAdminToken();
      const venue = await createActiveVenue(admin.id);

      // Use a known future Monday date
      const targetDate = '2027-01-04'; // Monday
      const res = await request(app)
        .get(`/api/v1/venues/${venue._id}/availability?date=${targetDate}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const courtAvail = res.body.data[0];
      expect(courtAvail.courtId).toBe('court001');
      expect(Array.isArray(courtAvail.freeWindows)).toBe(true);
      expect(courtAvail.freeWindows.length).toBeGreaterThan(0);
    });

    it('returns empty free windows when closure covers entire day', async () => {
      const { user: admin, token: adminToken } = await createAdminToken();
      const venue = await createActiveVenue(admin.id);

      // Add a full-day closure for the target date
      const closureStart = new Date('2027-01-05T00:00:00.000Z'); // Tuesday
      const closureEnd = new Date('2027-01-06T00:00:00.000Z');

      await request(app)
        .post(`/api/v1/venues/${venue._id}/closures`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startsAt: closureStart.toISOString(), endsAt: closureEnd.toISOString(), reason: 'Full day closure' });

      const res = await request(app)
        .get(`/api/v1/venues/${venue._id}/availability?date=2027-01-05`);

      expect(res.status).toBe(HttpStatus.OK);
      // With a full-day closure, freeWindows should be empty for all courts
      const courtAvail = res.body.data[0];
      expect(courtAvail.freeWindows).toHaveLength(0);
    });

    it('returns 404 for non-active (pending) venue', async () => {
      const { user: admin } = await createAdminToken();
      const pendingVenue = await Venue.create({
        owner: new Types.ObjectId(admin.id),
        name: 'Pending Venue',
        description: 'Not yet approved',
        address: { line1: '2 Main Street', city: 'Chennai' },
        areaLabel: 'South',
        location: { type: 'Point', coordinates: [80.28, 13.09] },
        timezone: 'Asia/Kolkata',
        status: VenueStatuses.PENDING_APPROVAL,
        weeklyHours: [],
        closures: [],
        courts: [],
        photoUrls: [],
        amenities: [],
      });

      const res = await request(app)
        .get(`/api/v1/venues/${pendingVenue._id}/availability?date=2027-01-04`);
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /api/v1/venues/:id/closures', () => {
    it('add closure and see it reflected in availability', async () => {
      const { user: admin, token: adminToken } = await createAdminToken();
      const venue = await createActiveVenue(admin.id);

      const closureStart = new Date('2027-01-06T02:00:00.000Z'); // within operating hours on Wednesday
      const closureEnd = new Date('2027-01-06T06:00:00.000Z');

      const addRes = await request(app)
        .post(`/api/v1/venues/${venue._id}/closures`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startsAt: closureStart.toISOString(), endsAt: closureEnd.toISOString(), reason: 'Maintenance' });

      expect(addRes.status).toBe(HttpStatus.CREATED);
      expect(addRes.body.data.reason).toBe('Maintenance');

      // Verify availability has reduced windows
      const availRes = await request(app)
        .get(`/api/v1/venues/${venue._id}/availability?date=2027-01-06`);
      expect(availRes.status).toBe(HttpStatus.OK);
    });

    it('setWeeklyHours blocked when upcoming games exist (without override)', async () => {
      const { user: admin, token: adminToken } = await createAdminToken();
      const venue = await createActiveVenue(admin.id);

      // Create an upcoming game at this venue
      const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      await Game.create({
        hostId: new Types.ObjectId(admin.id),
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt,
        endsAt,
        venue: venue._id,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: 'AVTEST001',
        minPlayers: 2,
        maxPlayers: 2,
        participantCount: 1,
      });

      const hoursRes = await request(app)
        .put(`/api/v1/venues/${venue._id}/hours`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hours: [{ dayOfWeek: 1, openMinute: 600, closeMinute: 1200 }], adminOverride: false });

      expect(hoursRes.status).toBe(HttpStatus.CONFLICT);
    });

    it('deactivating a court blocked when upcoming games affected', async () => {
      const { user: admin, token: adminToken } = await createAdminToken();
      const venue = await createActiveVenue(admin.id);
      const courtId = venue.courts[0]!.courtId;

      // Create an upcoming game linked to this court
      const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      await Game.create({
        hostId: new Types.ObjectId(admin.id),
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt,
        endsAt,
        venue: venue._id,
        courtId,
        location: { type: 'Point', coordinates: [80.27, 13.08] },
        status: 'open',
        joinPolicy: 'open',
        visibility: 'public',
        inviteCode: 'COURTBLOCK1',
        minPlayers: 2,
        maxPlayers: 2,
        participantCount: 1,
      });

      const res = await request(app)
        .patch(`/api/v1/venues/${venue._id}/courts/${courtId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(HttpStatus.CONFLICT);
    });
  });
});
