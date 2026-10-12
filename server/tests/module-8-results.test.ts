import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import {
  GameStatuses,
  JoinPolicies,
  GameVisibilities,
} from '../src/constants/game-constants.js';
import {
  ResultStatuses,
  RatingStatuses,
} from '../src/constants/result-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { Profile } from '../src/models/profile.model.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Rating } from '../src/models/rating.model.js';
import { Game } from '../src/models/game.model.js';
import { GameResult } from '../src/models/game-result.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { domainEvents } from '../src/utils/domain-events.js';

async function completeOnboarding(userId: string, displayName: string) {
  await Profile.create({
    user: userId,
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
}

async function createOnboardedPlayer(
  sportId: Types.ObjectId,
  displayName: string,
  rating: number = 1200,
) {
  const { user } = await createTestUser();
  const token = tokenService.generateAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  await completeOnboarding(user.id, displayName);
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
    rating,
    seedRating: rating,
    seedBandKey: 'intermediate',
    gamesPlayed: 5,
    peakRating: rating,
    wins: 0,
    losses: 0,
    draws: 0,
    lastRatedAt: new Date(),
    history: [],
  });
  return { user, token };
}

describe('Module 8: Result Submission & Verification', () => {
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
    const host = await createOnboardedPlayer(testSport._id, 'Host Player', 1200);
    hostUser = host.user;
    hostToken = host.token;
  });

  async function createSinglesGame() {
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
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        joinPolicy: JoinPolicies.OPEN,
        visibility: GameVisibilities.PUBLIC,
      });
    expect(res.status).toBe(HttpStatus.CREATED);
    return res.body.data.id as string;
  }

  it('Happy Path: Submits result proposal, transitions game, verifies and applies Elo ratings', async () => {
    const gameId = await createSinglesGame();
    const opponent = await createOnboardedPlayer(testSport._id, 'Opponent Player', 1200);

    // Opponent joins the game
    const joinRes = await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${opponent.token}`);
    expect(joinRes.status).toBe(HttpStatus.OK);

    // Track domain events
    let submittedEventFired = false;
    let verifiedEventFired = false;
    domainEvents.on('game.result_submitted', (e) => {
      if (e.gameId === gameId) submittedEventFired = true;
    });
    domainEvents.on('game.result_verified', (e) => {
      if (e.gameId === gameId) verifiedEventFired = true;
    });

    // 1. Host submits scores
    const submitRes = await request(app)
      .post(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        scores: [
          { sideKey: 'team_a', score: 21, winner: true },
          { sideKey: 'team_b', score: 18, winner: false },
        ],
        notes: 'Close competitive game',
      });

    expect(submitRes.status).toBe(HttpStatus.CREATED);
    expect(submitRes.body.success).toBe(true);
    const resultData = submitRes.body.data;
    expect(resultData.status).toBe(ResultStatuses.PENDING_CONFIRMATION);
    expect(resultData.ratingStatus).toBe(RatingStatuses.NOT_PROCESSED);
    expect(resultData.whoMustActNext).toContain(opponent.user.id);
    expect(resultData.whoMustActNext).not.toContain(hostUser.id);
    expect(resultData.proposal.scores).toHaveLength(2);
    expect(submittedEventFired).toBe(true);

    // Verify game transitioned to completed
    const updatedGame = await Game.findById(gameId);
    expect(updatedGame?.status).toBe(GameStatuses.COMPLETED);

    // 2. Fetch result state via GET /api/v1/games/:id/results
    const getRes = await request(app)
      .get(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${opponent.token}`);
    expect(getRes.status).toBe(HttpStatus.OK);
    expect(getRes.body.data.status).toBe(ResultStatuses.PENDING_CONFIRMATION);

    // 3. Opponent verifies the proposal
    const verifyRes = await request(app)
      .post(`/api/v1/games/${gameId}/results/verify`)
      .set('Authorization', `Bearer ${opponent.token}`)
      .send({});
    console.log("Error details:", verifyRes.body);
    expect(verifyRes.status).toBe(HttpStatus.OK);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.status).toBe(ResultStatuses.VERIFIED);
    expect(verifyRes.body.data.ratingStatus).toBe(RatingStatuses.APPLIED);
    expect(verifyRes.body.data.whoMustActNext).toEqual([]);
    expect(verifiedEventFired).toBe(true);

    // 4. Verify Elo rating updates were applied to database
    const hostRating = await Rating.findOne({ user: hostUser.id, sport: testSport._id });
    const oppRating = await Rating.findOne({ user: opponent.user.id, sport: testSport._id });

    // Host won, so rating should increase; opponent lost, so rating should decrease
    expect(hostRating?.rating).toBeGreaterThan(1200);
    expect(oppRating?.rating).toBeLessThan(1200);
  });

  it('Dispute Path: Opponent disputes proposed score', async () => {
    const gameId = await createSinglesGame();
    const opponent = await createOnboardedPlayer(testSport._id, 'Opponent 2', 1200);

    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${opponent.token}`);

    let disputeEventFired = false;
    domainEvents.on('game.result_disputed', (e) => {
      if (e.gameId === gameId) disputeEventFired = true;
    });

    // Host submits score
    await request(app)
      .post(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        scores: [
          { sideKey: 'team_a', score: 21, winner: true },
          { sideKey: 'team_b', score: 15, winner: false },
        ],
      });

    // Opponent disputes score
    const disputeRes = await request(app)
      .post(`/api/v1/games/${gameId}/results/dispute`)
      .set('Authorization', `Bearer ${opponent.token}`)
      .send({ reason: 'Actual score was 21-19, not 21-15' });

    expect(disputeRes.status).toBe(HttpStatus.OK);
    expect(disputeRes.body.success).toBe(true);
    expect(disputeRes.body.data.status).toBe(ResultStatuses.DISPUTED);
    expect(disputeRes.body.data.ratingStatus).toBe(RatingStatuses.NOT_PROCESSED);
    expect(disputeEventFired).toBe(true);

    // Rating should remain unchanged
    const hostRating = await Rating.findOne({ user: hostUser.id, sport: testSport._id });
    expect(hostRating?.rating).toBe(1200);
  });

  it('Authorization: Non-participant cannot submit results', async () => {
    const gameId = await createSinglesGame();
    const outsider = await createOnboardedPlayer(testSport._id, 'Outsider', 1200);

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({
        scores: [
          { sideKey: 'team_a', score: 21, winner: true },
          { sideKey: 'team_b', score: 10, winner: false },
        ],
      });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_FORBIDDEN);
  });

  it('Authorization: Submitter (same team) cannot verify own proposed result', async () => {
    const gameId = await createSinglesGame();
    const opponent = await createOnboardedPlayer(testSport._id, 'Opponent 3', 1200);

    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${opponent.token}`);

    // Host submits score
    await request(app)
      .post(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        scores: [
          { sideKey: 'team_a', score: 21, winner: true },
          { sideKey: 'team_b', score: 10, winner: false },
        ],
      });

    // Host tries to verify own proposal
    const verifyRes = await request(app)
      .post(`/api/v1/games/${gameId}/results/verify`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({});

    expect(verifyRes.status).toBe(HttpStatus.FORBIDDEN);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.error.code).toBe(ErrorCodes.AUTH_FORBIDDEN);
  });

  it('Rejects duplicate submission if proposal is already pending', async () => {
    const gameId = await createSinglesGame();
    const opponent = await createOnboardedPlayer(testSport._id, 'Opponent 4', 1200);

    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${opponent.token}`);

    // First submission
    const res1 = await request(app)
      .post(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        scores: [
          { sideKey: 'team_a', score: 21, winner: true },
          { sideKey: 'team_b', score: 10, winner: false },
        ],
      });
    expect(res1.status).toBe(HttpStatus.CREATED);

    // Duplicate submission
    const res2 = await request(app)
      .post(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        scores: [
          { sideKey: 'team_a', score: 21, winner: true },
          { sideKey: 'team_b', score: 12, winner: false },
        ],
      });
    expect(res2.status).toBe(HttpStatus.CONFLICT);
    expect(res2.body.error.code).toBe(ErrorCodes.RESULT_ALREADY_SUBMITTED);
  });

  it('Returns 404 when fetching results for game without any result proposal', async () => {
    const gameId = await createSinglesGame();

    const res = await request(app)
      .get(`/api/v1/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.error.code).toBe(ErrorCodes.RESULT_NOT_FOUND);
  });
});
