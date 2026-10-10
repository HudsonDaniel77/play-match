import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { GameStatuses, JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Profile } from '../src/models/profile.model.js';
import { Rating } from '../src/models/rating.model.js';
import { Game } from '../src/models/game.model.js';
import { GameParticipant } from '../src/models/game-participant.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';

describe('Module 4: Eligibility & Privacy Coarsening', () => {
  let hostUser: any;
  let hostToken: string;
  let playerUser: any;
  let playerToken: string;
  let testSport: any;

  beforeEach(async () => {
    const host = await createTestUser();
    hostUser = host.user;
    hostToken = tokenService.generateAccessToken({
      userId: hostUser.id,
      role: hostUser.role,
      email: hostUser.email,
    });

    const player = await createTestUser();
    playerUser = player.user;
    playerToken = tokenService.generateAccessToken({
      userId: playerUser.id,
      role: playerUser.role,
      email: playerUser.email,
    });

    testSport = await createTestSport({ key: 'badminton', name: 'Badminton' });

    // Host onboarding & profile
    await Profile.create({
      user: hostUser.id,
      displayName: 'Host Player',
      bio: 'Bio',
      homeLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
      travelRadiusKm: 15,
      availability: [{ dayOfWeek: 1, startMinute: 600, endMinute: 720 }],
      visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
      onboarding: {
        status: OnboardingStatuses.COMPLETED,
        completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'],
        completedAt: new Date(),
      },
    });
    await SportProfile.create({
      user: hostUser.id,
      sport: testSport._id,
      selectedBandKey: 'intermediate',
      isActive: true,
    });
    await Rating.create({
      user: hostUser.id,
      sport: testSport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
    });

    // Player onboarding & profile
    await Profile.create({
      user: playerUser.id,
      displayName: 'Joining Player',
      bio: 'Bio',
      homeLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
      travelRadiusKm: 15,
      availability: [{ dayOfWeek: 1, startMinute: 600, endMinute: 720 }],
      visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
      onboarding: {
        status: OnboardingStatuses.COMPLETED,
        completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'],
        completedAt: new Date(),
      },
    });
  });

  it('coarsens exact coordinates and hides courtName for non-joined viewer', async () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const gameRes = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: {
          type: 'Point',
          coordinates: [77.594582, 12.971598], // Detailed precision
          addressName: 'Exact Secret Club Address',
        },
        courtName: 'Court 3 VIP',
      });

    const gameId = gameRes.body.data.id;

    // Fetch as playerUser (not joined yet)
    const viewRes = await request(app)
      .get(`/api/v1/games/${gameId}`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(viewRes.status).toBe(HttpStatus.OK);
    // Location coordinates must be coarsened to 2 decimal places (default config)
    expect(viewRes.body.data.location.coordinates[0]).toBe(77.59);
    expect(viewRes.body.data.location.coordinates[1]).toBe(12.97);
    // Exact courtName should not be exposed
    expect(viewRes.body.data.courtName).toBeUndefined();
    expect(viewRes.body.data.location.addressName).toBeUndefined();

    // Fetch as hostUser (should see full exact location)
    const hostViewRes = await request(app)
      .get(`/api/v1/games/${gameId}`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(hostViewRes.status).toBe(HttpStatus.OK);
    expect(hostViewRes.body.data.courtName).toBe('Court 3 VIP');
    expect(hostViewRes.body.data.location.addressName).toBe('Exact Secret Club Address');
  });

  it('enforces rating range eligibility and rejects joining when outside rating bounds', async () => {
    // Add sport profile and low rating (800) for playerUser
    await SportProfile.create({
      user: playerUser.id,
      sport: testSport._id,
      selectedBandKey: 'beginner',
      isActive: true,
    });
    await Rating.create({
      user: playerUser.id,
      sport: testSport._id,
      rating: 800,
      seedRating: 800,
      seedBandKey: 'beginner',
    });

    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    // Host creates game restricted to rating [1100, 1500]
    const gameRes = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
        },
        ratingRange: {
          min: 1100,
          max: 1500,
          allowUnrated: false,
        },
      });

    const gameId = gameRes.body.data.id;

    // Check eligibility pre-flight
    const eligRes = await request(app)
      .get(`/api/v1/games/${gameId}/eligibility`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(eligRes.status).toBe(HttpStatus.OK);
    expect(eligRes.body.data.eligible).toBe(false);
    expect(eligRes.body.data.reasons).toContain('outside_rating_range');

    // Attempting to join fails
    const joinRes = await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(joinRes.status).toBe(HttpStatus.BAD_REQUEST);
    expect(joinRes.body.error.code).toBe(ErrorCodes.GAME_OUTSIDE_RATING_RANGE);
  });

  it('detects schedule conflict if player has overlapping joined game', async () => {
    // Add valid sport profile for playerUser
    await SportProfile.create({
      user: playerUser.id,
      sport: testSport._id,
      selectedBandKey: 'intermediate',
      isActive: true,
    });

    const startsAt1 = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt1 = new Date(startsAt1.getTime() + 60 * 60 * 1000);

    // Game 1
    const game1Res = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt: startsAt1.toISOString(),
        endsAt: endsAt1.toISOString(),
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      });

    // Player joins Game 1
    await request(app)
      .post(`/api/v1/games/${game1Res.body.data.id}/join`)
      .set('Authorization', `Bearer ${playerToken}`);

    // Game 2 overlapping with Game 1
    const startsAt2 = new Date(startsAt1.getTime() + 30 * 60 * 1000); // 30 minutes into game 1
    const endsAt2 = new Date(startsAt2.getTime() + 60 * 60 * 1000);

    const game2 = await Game.create({
      hostId: hostUser.id,
      sportKey: 'badminton',
      formatKey: 'singles',
      status: GameStatuses.OPEN,
      joinPolicy: JoinPolicies.OPEN,
      visibility: GameVisibilities.PUBLIC,
      minPlayers: 2,
      maxPlayers: 2,
      participantCount: 1,
      startsAt: startsAt2,
      endsAt: endsAt2,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });

    // Attempting to join Game 2 fails due to schedule conflict
    const joinRes = await request(app)
      .post(`/api/v1/games/${game2.id}/join`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(joinRes.status).toBe(HttpStatus.CONFLICT);
    expect(joinRes.body.error.code).toBe(ErrorCodes.GAME_SCHEDULE_CONFLICT);
  });
});
