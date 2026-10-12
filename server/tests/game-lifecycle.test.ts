import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import {
  GameStatuses,
  JoinPolicies,
  GameVisibilities,
  ParticipantStatuses,
  CancellationReasonCodes,
} from '../src/constants/game-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Profile } from '../src/models/profile.model.js';
import { Game } from '../src/models/game.model.js';
import { GameParticipant } from '../src/models/game-participant.model.js';
import { GameEvent } from '../src/models/game-event.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { TestClock } from '../src/utils/clock.js';
import { GameParticipantService } from '../src/services/game-participant.service.js';
import { transitionGame } from '../src/services/game-transition.service.js';

describe('Module 4: Game Lifecycle, Roster, Leaves & Promotions', () => {
  let hostUser: any;
  let hostToken: string;
  let player1: any;
  let player1Token: string;
  let player2: any;
  let player2Token: string;
  let testSport: any;

  beforeEach(async () => {
    const host = await createTestUser();
    hostUser = host.user;
    hostToken = tokenService.generateAccessToken({
      userId: hostUser.id,
      role: hostUser.role,
      email: hostUser.email,
    });

    const p1 = await createTestUser();
    player1 = p1.user;
    player1Token = tokenService.generateAccessToken({
      userId: player1.id,
      role: player1.role,
      email: player1.email,
    });

    const p2 = await createTestUser();
    player2 = p2.user;
    player2Token = tokenService.generateAccessToken({
      userId: player2.id,
      role: player2.role,
      email: player2.email,
    });

    testSport = await createTestSport({ key: 'badminton', name: 'Badminton' });

    for (const u of [hostUser, player1, player2]) {
      await Profile.create({
        user: u.id,
        displayName: u.name,
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
        user: u.id,
        sport: testSport._id,
        selectedBandKey: 'intermediate',
        isActive: true,
      });
    }
  });

  it('handles host approval and decline flows with APPROVAL join policy', async () => {
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
        joinPolicy: JoinPolicies.APPROVAL,
      });

    const gameId = gameRes.body.data.id;

    // Player 1 requests to join
    const reqRes = await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    expect(reqRes.status).toBe(HttpStatus.OK);
    expect(reqRes.body.data.status).toBe(ParticipantStatuses.REQUESTED);

    // Host sees request in roster
    const rosterRes = await request(app)
      .get(`/api/v1/games/${gameId}/roster`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(rosterRes.body.data.requested.length).toBe(1);
    expect(rosterRes.body.data.requested[0].userId).toBe(player1.id.toString());

    // Host approves Player 1
    const approveRes = await request(app)
      .post(`/api/v1/games/${gameId}/participants/${player1.id}/approve`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(approveRes.status).toBe(HttpStatus.OK);

    // Verify Player 1 is joined, and game is FULL
    const updatedGame = await Game.findById(gameId);
    expect(updatedGame?.participantCount).toBe(2);
    expect(updatedGame?.status).toBe(GameStatuses.FULL);

    const p1Doc = await GameParticipant.findOne({ gameId, userId: player1.id });
    expect(p1Doc?.status).toBe(ParticipantStatuses.JOINED);
  });

  it('promotes waitlisted player when a joined participant leaves, and prevents host from leaving', async () => {
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
        joinPolicy: JoinPolicies.OPEN,
      });

    const gameId = gameRes.body.data.id;

    // Player 1 joins (takes final open seat)
    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    // Player 2 joins (gets waitlisted)
    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player2Token}`);

    const dbGameBefore = await Game.findById(gameId);
    expect(dbGameBefore?.status).toBe(GameStatuses.FULL);
    expect(dbGameBefore?.waitlistCount).toBe(1);

    // Host attempts to leave -> REJECTED (Requirement 11: host cannot leave)
    const hostLeaveRes = await request(app)
      .post(`/api/v1/games/${gameId}/leave`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(hostLeaveRes.status).toBe(HttpStatus.BAD_REQUEST);
    expect(hostLeaveRes.body.error.code).toBe(ErrorCodes.GAME_HOST_CANNOT_LEAVE);

    // Player 1 leaves (on-time because > 60m before start)
    const p1LeaveRes = await request(app)
      .post(`/api/v1/games/${gameId}/leave`)
      .set('Authorization', `Bearer ${player1Token}`);

    expect(p1LeaveRes.status).toBe(HttpStatus.OK);
    expect(p1LeaveRes.body.data.leaveType).toBe('on_time');

    // Player 2 should now be automatically PROMOTED from waitlist into joined seat!
    const dbGameAfter = await Game.findById(gameId);
    expect(dbGameAfter?.participantCount).toBe(2);
    expect(dbGameAfter?.waitlistCount).toBe(0);

    const p2Doc = await GameParticipant.findOne({ gameId, userId: player2.id });
    expect(p2Doc?.status).toBe(ParticipantStatuses.JOINED);
  });

  it('marks leave as late if leaving after leave cutoff (< 60m before startsAt)', async () => {
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

    // Player 1 joins
    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    // Simulate clock advancing to 30 minutes before game start (past 60m cutoff)
    const lateClock = new TestClock(startsAt.getTime() - 30 * 60 * 1000);

    const result = await GameParticipantService.leaveGame(player1.id, gameId, lateClock);
    expect(result.leaveType).toBe('late');

    const p1Doc = await GameParticipant.findOne({ gameId, userId: player1.id });
    expect(p1Doc?.leaveType).toBe('late');
  });

  it('re-evaluates confirmed game to open when participant leaves without waitlist', async () => {
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

    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    // Transition to confirmed
    const game = await Game.findById(gameId);
    await transitionGame(game!, {
      toStatus: GameStatuses.CONFIRMED,
      actorRole: 'system',
    });

    const confirmedGame = await Game.findById(gameId);
    expect(confirmedGame?.status).toBe(GameStatuses.CONFIRMED);

    // Player 1 leaves (no waitlist available)
    await request(app)
      .post(`/api/v1/games/${gameId}/leave`)
      .set('Authorization', `Bearer ${player1Token}`);

    // Confirmed game drops to 1 player (< minPlayers of 2), transitions back to OPEN
    const afterGame = await Game.findById(gameId);
    expect(afterGame?.status).toBe(GameStatuses.OPEN);
    expect(afterGame?.participantCount).toBe(1);
  });

  it('supports pagination on /games/me', async () => {
    const meRes = await request(app)
      .get('/api/v1/games/me?page=1&limit=10')
      .set('Authorization', `Bearer ${hostToken}`);

    expect(meRes.status).toBe(HttpStatus.OK);
    expect(meRes.body.data.games).toBeDefined();
    expect(meRes.body.data.pagination).toBeDefined();
    expect(meRes.body.data.pagination.page).toBe(1);
    expect(meRes.body.data.pagination.limit).toBe(10);
  });
});
