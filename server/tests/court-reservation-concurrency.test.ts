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
import { VenueStatuses } from '../src/constants/venue-constants.js';
import { JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { Types } from 'mongoose';

async function createOnboardedHost() {
  const { user } = await createTestUser({ role: Roles.PLAYER });
  const sport = await createTestSport({ key: `sport-${Date.now()}`, name: 'Badminton' });
  await Profile.create({
    user: user.id,
    displayName: 'Host Player',
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

async function createVenueWithCourt(ownerId: string, sportKey: string) {
  const courtId = `court-${Date.now()}`;
  const venue = await Venue.create({
    owner: new Types.ObjectId(ownerId),
    name: 'Race Test Venue',
    description: 'A venue for concurrency tests',
    address: { line1: '1 Test St', city: 'Chennai' },
    areaLabel: 'Test Area',
    location: { type: 'Point', coordinates: [80.27, 13.08] },
    timezone: 'Asia/Kolkata',
    status: VenueStatuses.ACTIVE,
    weeklyHours: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openMinute: 0, closeMinute: 1440 })),
    closures: [],
    courts: [{ courtId, name: 'Test Court', sportKeys: [sportKey], isActive: true }],
    photoUrls: [],
    amenities: [],
  });
  // Create the CourtGuard
  await CourtGuard.create({ venueId: venue._id, courtId, version: 1 });
  return { venue, courtId };
}

describe('Module 5: Court Reservation Concurrency', () => {
  it('two concurrent requests for same court at overlapping times: only one succeeds', async () => {
    const { user, token, sport } = await createOnboardedHost();
    const { venue, courtId } = await createVenueWithCourt(user.id, sport.key);

    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const gameBody = {
      sportKey: sport.key,
      formatKey: 'singles',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      venueId: venue._id.toString(),
      courtId,
      joinPolicy: JoinPolicies.OPEN,
      visibility: GameVisibilities.PUBLIC,
    };

    // Fire two simultaneous requests
    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/games').set('Authorization', `Bearer ${token}`).send(gameBody),
      request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...gameBody, startsAt: new Date(startsAt.getTime() + 10 * 60 * 1000).toISOString() }), // 10min overlap
    ]);

    const statuses = [res1.status, res2.status];
    // At least one must succeed (201) and the other must fail (409 COURT_CONFLICT or 500)
    expect(statuses).toContain(HttpStatus.CREATED);
    // The other should be a conflict or error
    const failed = [res1, res2].find((r) => r.status !== HttpStatus.CREATED);
    expect(failed).toBeDefined();
    expect(failed!.status).toBeGreaterThanOrEqual(400);
  });

  it('non-overlapping times on same court: both succeed', async () => {
    const { user: host1, token: t1, sport } = await createOnboardedHost();
    const { user: host2, token: t2 } = await createOnboardedHost();
    // Give host2 the same sport
    const existingSportProfile = await SportProfile.findOne({ user: host1.id });
    await SportProfile.create({ user: host2.id, sport: existingSportProfile!.sport, selectedBandKey: 'intermediate', isActive: true });

    const { venue, courtId } = await createVenueWithCourt(host1.id, sport.key);

    const starts1 = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const ends1 = new Date(starts1.getTime() + 60 * 60 * 1000);
    const starts2 = new Date(ends1.getTime() + 30 * 60 * 1000); // 30min gap after buffer
    const ends2 = new Date(starts2.getTime() + 60 * 60 * 1000);

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${t1}`)
        .send({ sportKey: sport.key, formatKey: 'singles', startsAt: starts1.toISOString(), endsAt: ends1.toISOString(), venueId: venue._id.toString(), courtId, joinPolicy: 'open', visibility: 'public' }),
      request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${t2}`)
        .send({ sportKey: sport.key, formatKey: 'singles', startsAt: starts2.toISOString(), endsAt: ends2.toISOString(), venueId: venue._id.toString(), courtId, joinPolicy: 'open', visibility: 'public' }),
    ]);

    expect(res1.status).toBe(HttpStatus.CREATED);
    expect(res2.status).toBe(HttpStatus.CREATED);
  });

  it('booking a court at a closed venue returns error', async () => {
    const { user, token, sport } = await createOnboardedHost();
    const closedVenue = await Venue.create({
      owner: new Types.ObjectId(user.id),
      name: 'Suspended Venue',
      description: 'This venue is suspended',
      address: { line1: '99 Closed St', city: 'Chennai' },
      areaLabel: 'Closed Area',
      location: { type: 'Point', coordinates: [80.27, 13.08] },
      timezone: 'Asia/Kolkata',
      status: VenueStatuses.SUSPENDED,
      weeklyHours: [],
      closures: [],
      courts: [{ courtId: 'closedcourt1', name: 'Closed Court', sportKeys: [sport.key], isActive: true }],
      photoUrls: [],
      amenities: [],
    });
    await CourtGuard.create({ venueId: closedVenue._id, courtId: 'closedcourt1', version: 1 });

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
        venueId: closedVenue._id.toString(),
        courtId: 'closedcourt1',
        joinPolicy: 'open',
        visibility: 'public',
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
