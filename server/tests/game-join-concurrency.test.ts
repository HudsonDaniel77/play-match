import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { GameStatuses, JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Profile } from '../src/models/profile.model.js';
import { Game } from '../src/models/game.model.js';
import { GameParticipant } from '../src/models/game-participant.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';

describe('Module 4: Race-Safe Seat Claim & Waitlist Concurrency', () => {
  let hostUser: any;
  let hostToken: string;
  let testSport: any;

  beforeEach(async () => {
    const host = await createTestUser();
    hostUser = host.user;
    hostToken = tokenService.generateAccessToken({
      userId: hostUser.id,
      role: hostUser.role,
      email: hostUser.email,
    });

    testSport = await createTestSport({ key: 'badminton', name: 'Badminton' });

    // Host onboarding
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
  });

  it('handles concurrent joins: claims exactly available seat, status becomes FULL, extra goes to waitlist', async () => {
    // Badminton singles: 2 max players (Host takes 1 seat, exactly 1 seat open)
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
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      });

    const gameId = gameRes.body.data.id;

    // Create 3 player users
    const players: any[] = [];
    for (let i = 0; i < 3; i++) {
      const { user } = await createTestUser();
      const token = tokenService.generateAccessToken({
        userId: user.id,
        role: user.role,
        email: user.email,
      });

      await Profile.create({
        user: user.id,
        displayName: `Player ${i + 1}`,
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
        user: user.id,
        sport: testSport._id,
        selectedBandKey: 'intermediate',
        isActive: true,
      });

      players.push({ user, token });
    }

    // Fire 3 concurrent joins
    const joinPromises = players.map((p) =>
      request(app)
        .post(`/api/v1/games/${gameId}/join`)
        .set('Authorization', `Bearer ${p.token}`),
    );

    const responses = await Promise.all(joinPromises);

    for (const res of responses) {
      expect(res.status).toBe(HttpStatus.OK);
    }

    const joinedCount = responses.filter((r) => r.body.data.status === 'joined').length;
    const waitlistedCount = responses.filter((r) => r.body.data.status === 'waitlisted').length;

    // Exactly 1 of the 3 players gets the open seat, and the other 2 get waitlisted
    expect(joinedCount).toBe(1);
    expect(waitlistedCount).toBe(2);

    // Verify DB game state
    const dbGame = await Game.findById(gameId);
    expect(dbGame?.participantCount).toBe(2);
    expect(dbGame?.waitlistCount).toBe(2);
    expect(dbGame?.status).toBe(GameStatuses.FULL);

    // Verify DB participants
    const activeJoined = await GameParticipant.countDocuments({
      gameId,
      status: 'joined',
    });
    expect(activeJoined).toBe(2); // Host + 1 winner

    const activeWaitlist = await GameParticipant.countDocuments({
      gameId,
      status: 'waitlisted',
    });
    expect(activeWaitlist).toBe(2);
  });
});
