import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { Messages } from '../src/constants/messages.js';
import { GameStatuses, JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Profile } from '../src/models/profile.model.js';
import { Game } from '../src/models/game.model.js';
import { GameParticipant } from '../src/models/game-participant.model.js';
import { GameEvent } from '../src/models/game-event.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';

describe('Module 4: Game Creation & Basic Management', () => {
  let hostUser: any;
  let hostToken: string;
  let testSport: any;

  beforeEach(async () => {
    const { user } = await createTestUser();
    hostUser = user;
    hostToken = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    testSport = await createTestSport({ key: 'badminton', name: 'Badminton' });

    // Complete onboarding for hostUser
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

    // Add SportProfile for badminton
    await SportProfile.create({
      user: hostUser.id,
      sport: testSport._id,
      selectedBandKey: 'intermediate',
      isActive: true,
    });
  });

  it('successfully creates a game, auto-joins host, and sets initial status to OPEN', async () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000); // 1 hour duration

    const res = await request(app)
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
          addressName: 'Kanteerava Stadium Court 1',
        },
        courtName: 'Court 1',
        joinPolicy: JoinPolicies.OPEN,
        visibility: GameVisibilities.PUBLIC,
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe(GameStatuses.OPEN);
    expect(res.body.data.participantCount).toBe(1);
    expect(res.body.data.minPlayers).toBe(2);
    expect(res.body.data.maxPlayers).toBe(2); // singles: 2 * 1 = 2

    // Verify DB participant
    const part = await GameParticipant.findOne({
      gameId: res.body.data.id,
      userId: hostUser.id,
    });
    expect(part).toBeDefined();
    expect(part?.role).toBe('host');
    expect(part?.status).toBe('joined');

    // Verify DB GameEvent
    const event = await GameEvent.findOne({
      gameId: res.body.data.id,
      type: 'game_created',
    });
    expect(event).toBeDefined();
    expect(event?.actorId?.toString()).toBe(hostUser.id.toString());
  });

  it('rejects game creation if startsAt is too soon (< GAME_CREATION_LEAD_TIME_MINUTES)', async () => {
    const startsAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now (lead time is 30m)
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const res = await request(app)
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
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.GAME_TIME_INVALID);
  });

  it('rejects game creation if user does not have the sport configured in their profile', async () => {
    // Create another sport not configured in host profile
    await createTestSport({ key: 'football', name: 'Football' });

    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'football',
        formatKey: 'singles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: {
          type: 'Point',
          coordinates: [77.5946, 12.9716],
        },
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.GAME_SPORT_NOT_IN_PROFILE);
  });

  it('creates private game with unique invite code', async () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const res = await request(app)
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
        visibility: GameVisibilities.PRIVATE,
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.data.visibility).toBe(GameVisibilities.PRIVATE);
    expect(res.body.data.inviteCode).toBeDefined();
    expect(res.body.data.inviteCode.length).toBe(8);
  });
});
