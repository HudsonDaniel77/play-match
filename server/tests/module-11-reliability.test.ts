import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { AttendanceStatuses, ReliabilityTiers } from '../src/constants/reliability-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { ReliabilityService } from '../src/services/reliability.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { Profile } from '../src/models/profile.model.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Rating } from '../src/models/rating.model.js';
import { Game } from '../src/models/game.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { TestClock } from '../src/utils/clock.js';

async function createOnboardedPlayer(sportId: Types.ObjectId, displayName: string) {
  const { user } = await createTestUser();
  const token = tokenService.generateAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  await Profile.create({
    user: user.id,
    displayName,
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
    sport: sportId,
    selectedBandKey: 'intermediate',
    preferredPositions: ['forward'],
    isActive: true,
  });
  await Rating.create({
    user: user.id,
    sport: sportId,
    rating: 1200,
    seedRating: 1200,
    seedBandKey: 'intermediate',
    gamesPlayed: 5,
    peakRating: 1200,
    wins: 0,
    losses: 0,
    draws: 0,
    lastRatedAt: new Date(),
    history: [],
  });
  return { user, token };
}

describe('Module 11: Feedback & Reliability', () => {
  let hostUser: any;
  let hostToken: string;
  let testSport: any;

  beforeEach(async () => {
    testSport = await createTestSport({
      key: 'badminton',
      name: 'Badminton',
      minPlayers: 2,
      maxPlayers: 4,
    });
    const host = await createOnboardedPlayer(testSport._id, 'Host Player');
    hostUser = host.user;
    hostToken = host.token;
  });

  async function createSinglesGame(startsInMinutes = 120) {
    const startsAt = new Date(Date.now() + startsInMinutes * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const res = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        joinPolicy: JoinPolicies.OPEN,
        visibility: GameVisibilities.PUBLIC,
      });
    expect(res.status).toBe(HttpStatus.CREATED);
    return res.body.data.id as string;
  }

  async function join(gameId: string, token: string) {
    const res = await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(HttpStatus.OK);
  }

  /** Creates a singles game, joins an opponent, and completes it via a result submission. */
  async function createCompletedGame(opponentName = 'Opponent') {
    const gameId = await createSinglesGame();
    const opponent = await createOnboardedPlayer(testSport._id, opponentName);
    await join(gameId, opponent.token);
    const submitRes = await request(app)
      .post(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        scores: [
          { sideKey: 'team_a', score: 21, winner: true },
          { sideKey: 'team_b', score: 15, winner: false },
        ],
      });
    expect(submitRes.status).toBe(HttpStatus.CREATED);
    return { gameId, opponent };
  }

  it('Happy Path: host records a no-show and reliability reflects it', async () => {
    const { gameId, opponent } = await createCompletedGame();

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        targetUserId: opponent.user.id,
        attendance: AttendanceStatuses.NO_SHOW,
        note: 'Did not turn up',
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data.attendance).toBe(AttendanceStatuses.NO_SHOW);
    expect(res.body.data.targetUserId).toBe(opponent.user.id);
    expect(res.body.data.reporterUserId).toBe(hostUser.id);

    const oppRel = await request(app)
      .get('/api/v1/reliability/me')
      .set('Authorization', `Bearer ${opponent.token}`);
    expect(oppRel.status).toBe(HttpStatus.OK);
    expect(oppRel.body.data.userId).toBe(opponent.user.id);
    expect(oppRel.body.data.reliability).toMatchObject({
      noShows: 1,
      gamesCounted: 1,
      onTimeLeaves: 0,
      lateLeaves: 0,
      score: 83,
      tier: ReliabilityTiers.SILVER,
    });

    const hostRel = await request(app)
      .get('/api/v1/reliability/me')
      .set('Authorization', `Bearer ${hostToken}`);
    expect(hostRel.status).toBe(HttpStatus.OK);
    expect(hostRel.body.data.reliability).toMatchObject({
      noShows: 0,
      gamesCounted: 1,
      score: 100,
    });
  });

  it('A new player starts at a score of 100 with no games counted', async () => {
    const res = await request(app)
      .get('/api/v1/reliability/me')
      .set('Authorization', `Bearer ${hostToken}`);
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.reliability).toMatchObject({
      score: 100,
      gamesCounted: 0,
      noShows: 0,
      onTimeLeaves: 0,
      lateLeaves: 0,
    });
  });

  it('Leaving a game early counts as an on-time leave', async () => {
    const gameId = await createSinglesGame(120);
    const player = await createOnboardedPlayer(testSport._id, 'Leaver');
    await join(gameId, player.token);

    const leaveRes = await request(app)
      .post(`/api/v1/games/${gameId}/leave`)
      .set('Authorization', `Bearer ${player.token}`);
    expect(leaveRes.status).toBe(HttpStatus.OK);

    const rel = await request(app)
      .get('/api/v1/reliability/me')
      .set('Authorization', `Bearer ${player.token}`);
    expect(rel.body.data.reliability).toMatchObject({
      onTimeLeaves: 1,
      lateLeaves: 0,
      gamesCounted: 1,
    });
    expect(rel.body.data.reliability.score).toBeLessThan(100);
  });

  it('Leaving inside the leave cutoff counts as a late leave and scores lower', async () => {
    const gameId = await createSinglesGame(45);
    const player = await createOnboardedPlayer(testSport._id, 'Late Leaver');
    await join(gameId, player.token);

    const leaveRes = await request(app)
      .post(`/api/v1/games/${gameId}/leave`)
      .set('Authorization', `Bearer ${player.token}`);
    expect(leaveRes.status).toBe(HttpStatus.OK);

    const rel = await request(app)
      .get('/api/v1/reliability/me')
      .set('Authorization', `Bearer ${player.token}`);
    expect(rel.body.data.reliability).toMatchObject({
      onTimeLeaves: 0,
      lateLeaves: 1,
      gamesCounted: 1,
    });
    // on-time leave score would be 96; a late leave must be lower
    expect(rel.body.data.reliability.score).toBeLessThan(96);
  });

  it('Authorization: only the host can submit feedback', async () => {
    const { gameId, opponent } = await createCompletedGame();

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${opponent.token}`)
      .send({ targetUserId: hostUser.id, attendance: AttendanceStatuses.NO_SHOW });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_FORBIDDEN);
  });

  it('Rejects feedback before the game is completed', async () => {
    const gameId = await createSinglesGame();
    const opponent = await createOnboardedPlayer(testSport._id, 'Opponent');
    await join(gameId, opponent.token);

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ targetUserId: opponent.user.id, attendance: AttendanceStatuses.ATTENDED });

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.error.code).toBe(ErrorCodes.FEEDBACK_GAME_NOT_COMPLETED);
  });

  it('Rejects feedback about yourself', async () => {
    const { gameId } = await createCompletedGame();

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ targetUserId: hostUser.id, attendance: AttendanceStatuses.ATTENDED });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.FEEDBACK_INVALID_TARGET);
  });

  it('Rejects feedback about a user who is not a joined participant', async () => {
    const { gameId } = await createCompletedGame();
    const outsider = await createOnboardedPlayer(testSport._id, 'Outsider');

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ targetUserId: outsider.user.id, attendance: AttendanceStatuses.NO_SHOW });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.FEEDBACK_INVALID_TARGET);
  });

  it('Rejects duplicate feedback for the same player in the same game', async () => {
    const { gameId, opponent } = await createCompletedGame();
    const body = { targetUserId: opponent.user.id, attendance: AttendanceStatuses.ATTENDED };

    const first = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send(body);
    expect(first.status).toBe(HttpStatus.CREATED);

    const second = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ ...body, attendance: AttendanceStatuses.NO_SHOW });
    expect(second.status).toBe(HttpStatus.CONFLICT);
    expect(second.body.error.code).toBe(ErrorCodes.FEEDBACK_ALREADY_SUBMITTED);
  });

  it('Rejects feedback after the feedback window has closed', async () => {
    const { gameId, opponent } = await createCompletedGame();
    const game = await Game.findById(gameId);

    const clock = new TestClock(game!.endsAt);
    clock.advanceByDays(30);

    await expect(
      ReliabilityService.submitFeedback(
        gameId,
        hostUser.id,
        { targetUserId: opponent.user.id, attendance: AttendanceStatuses.NO_SHOW },
        clock,
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCodes.FEEDBACK_WINDOW_CLOSED,
    });
  });

  it('Validation: rejects an invalid attendance value and malformed ids', async () => {
    const { gameId, opponent } = await createCompletedGame();

    const badAttendance = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ targetUserId: opponent.user.id, attendance: 'maybe' });
    expect(badAttendance.status).toBe(HttpStatus.BAD_REQUEST);
    expect(badAttendance.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);

    const badTarget = await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ targetUserId: 'not-an-id', attendance: AttendanceStatuses.NO_SHOW });
    expect(badTarget.status).toBe(HttpStatus.BAD_REQUEST);

    const badGameId = await request(app)
      .get('/api/v1/games/not-an-id/feedback')
      .set('Authorization', `Bearer ${hostToken}`);
    expect(badGameId.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('Requires authentication', async () => {
    const res = await request(app).get('/api/v1/reliability/me');
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('Feedback list: host sees all entries, target sees only their own, outsiders are rejected', async () => {
    const { gameId, opponent } = await createCompletedGame();
    const outsider = await createOnboardedPlayer(testSport._id, 'Outsider');

    await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ targetUserId: opponent.user.id, attendance: AttendanceStatuses.ATTENDED });

    const hostList = await request(app)
      .get(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`);
    expect(hostList.status).toBe(HttpStatus.OK);
    expect(hostList.body.data.feedback).toHaveLength(1);

    const oppList = await request(app)
      .get(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${opponent.token}`);
    expect(oppList.status).toBe(HttpStatus.OK);
    expect(oppList.body.data.feedback).toHaveLength(1);
    expect(oppList.body.data.feedback[0].targetUserId).toBe(opponent.user.id);

    const outsiderList = await request(app)
      .get(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(outsiderList.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('Privacy: other players reliability is visible unless the profile hides ratings', async () => {
    const target = await createOnboardedPlayer(testSport._id, 'Target');

    const visible = await request(app)
      .get(`/api/v1/reliability/${target.user.id}`)
      .set('Authorization', `Bearer ${hostToken}`);
    expect(visible.status).toBe(HttpStatus.OK);
    expect(visible.body.data.userId).toBe(target.user.id);

    await Profile.updateOne({ user: target.user.id }, { 'visibility.ratings': 'hidden' });

    const hidden = await request(app)
      .get(`/api/v1/reliability/${target.user.id}`)
      .set('Authorization', `Bearer ${hostToken}`);
    expect(hidden.status).toBe(HttpStatus.FORBIDDEN);
    expect(hidden.body.error.code).toBe(ErrorCodes.PROFILE_PRIVATE);

    // The owner can always see their own
    const own = await request(app)
      .get('/api/v1/reliability/me')
      .set('Authorization', `Bearer ${target.token}`);
    expect(own.status).toBe(HttpStatus.OK);
  });

  it('Recomputation is idempotent', async () => {
    const { gameId, opponent } = await createCompletedGame();
    await request(app)
      .post(`/api/v1/games/${gameId}/feedback`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ targetUserId: opponent.user.id, attendance: AttendanceStatuses.NO_SHOW });

    const first = await ReliabilityService.recomputeForUser(opponent.user.id);
    const second = await ReliabilityService.recomputeForUser(opponent.user.id);
    expect(second.score).toBe(first.score);
    expect(second.noShows).toBe(1);
    expect(second.gamesCounted).toBe(first.gamesCounted);
  });
});
