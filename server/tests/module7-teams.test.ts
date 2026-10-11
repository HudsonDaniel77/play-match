import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { GameEventTypes, JoinPolicies, GameVisibilities } from '../src/constants/game-constants.js';
import { TeamBalanceMethods, TeamSideKeys } from '../src/constants/team-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { Profile } from '../src/models/profile.model.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Rating } from '../src/models/rating.model.js';
import { GameEvent } from '../src/models/game-event.model.js';
import { GameTeamFormation } from '../src/models/game-team-formation.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { TeamService } from '../src/services/team.service.js';
import { TestClock } from '../src/utils/clock.js';

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
  rating?: number,
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
  if (rating !== undefined) {
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
  }
  return { user, token };
}

describe('Module 7: Team Formation', () => {
  let hostToken: string;
  let hostUser: { id: string };
  let testSport: { _id: Types.ObjectId; key: string };

  beforeEach(async () => {
    const host = await createTestUser();
    hostUser = host.user;
    hostToken = tokenService.generateAccessToken({
      userId: host.user.id,
      role: host.user.role,
      email: host.user.email,
    });
    testSport = await createTestSport({ key: 'badminton', name: 'Badminton' });
    await completeOnboarding(host.user.id, 'Host');
    await SportProfile.create({
      user: host.user.id,
      sport: testSport._id,
      selectedBandKey: 'intermediate',
      isActive: true,
    });
    await Rating.create({
      user: host.user.id,
      sport: testSport._id,
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
  });

  async function createDoublesGame() {
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const res = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'doubles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        joinPolicy: JoinPolicies.OPEN,
        visibility: GameVisibilities.PUBLIC,
      });
    expect(res.status).toBe(HttpStatus.CREATED);
    return res.body.data.id as string;
  }

  it('returns insufficient participants when roster cannot split into two teams', async () => {
    const gameId = await createDoublesGame();

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/teams/generate`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({});

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.INSUFFICIENT_PARTICIPANTS_FOR_SUGGESTION);
  });

  it('generates balanced teams from Elo ratings and persists snapshot', async () => {
    const gameId = await createDoublesGame();
    const ratings = [1600, 1500, 1400, 1300];
    for (let i = 0; i < 3; i++) {
      const { user, token } = await createOnboardedPlayer(testSport._id, `P${i + 1}`, ratings[i]);
      const joinRes = await request(app)
        .post(`/api/v1/games/${gameId}/join`)
        .set('Authorization', `Bearer ${token}`);
      expect(joinRes.status).toBe(HttpStatus.OK);
      expect(user.id).toBeDefined();
    }
    await Rating.findOneAndUpdate(
      { user: hostUser.id, sport: testSport._id },
      { rating: ratings[3] },
    );

    const genRes = await request(app)
      .post(`/api/v1/games/${gameId}/teams/generate`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({});

    expect(genRes.status).toBe(HttpStatus.CREATED);
    expect(genRes.body.success).toBe(true);
    const data = genRes.body.data;
    expect(data.teams).toHaveLength(2);
    expect(data.balance.method).toBe(TeamBalanceMethods.SNAKE_DRAFT_ELO);
    expect(data.balance.difference).toBe(0);
    expect(data.reasons.length).toBeGreaterThan(0);

    const teamA = data.teams.find((t: { sideKey: string }) => t.sideKey === TeamSideKeys.TEAM_A);
    const teamB = data.teams.find((t: { sideKey: string }) => t.sideKey === TeamSideKeys.TEAM_B);
    expect(teamA.ratingTotal).toBe(2900);
    expect(teamB.ratingTotal).toBe(2900);
    expect(teamA.players).toHaveLength(2);
    expect(teamB.players).toHaveLength(2);

    const getRes = await request(app)
      .get(`/api/v1/games/${gameId}/teams`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(getRes.status).toBe(HttpStatus.OK);
    expect(getRes.body.data.balance.difference).toBe(0);

    const saved = await GameTeamFormation.findOne({ gameId: new Types.ObjectId(gameId) });
    expect(saved).not.toBeNull();
  });

  it('enforces authentication and host-only generation', async () => {
    const gameId = await createDoublesGame();
    const { token: playerToken } = await createOnboardedPlayer(testSport._id, 'Guest', 1300);

    const unauth = await request(app).post(`/api/v1/games/${gameId}/teams/generate`).send({});
    expect(unauth.status).toBe(HttpStatus.UNAUTHORIZED);

    const forbidden = await request(app)
      .post(`/api/v1/games/${gameId}/teams/generate`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({});
    expect(forbidden.status).toBe(HttpStatus.FORBIDDEN);
    expect(forbidden.body.error.code).toBe(ErrorCodes.FORBIDDEN_ACCESS);
  });

  it('requires completed onboarding', async () => {
    const gameId = await createDoublesGame();
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
    await Profile.create({
      user: user.id,
      displayName: 'Incomplete',
      bio: '',
      homeLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
      travelRadiusKm: 10,
      availability: [],
      visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
      onboarding: {
        status: OnboardingStatuses.IN_PROGRESS,
        completedSteps: ['basic'],
      },
    });

    const res = await request(app)
      .get(`/api/v1/games/${gameId}/teams`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.error.code).toBe(ErrorCodes.ONBOARDING_INCOMPLETE);
  });

  it('records teams_generated event with TestClock timestamp', async () => {
    const gameId = await createDoublesGame();
    const clock = new TestClock('2026-06-15T12:00:00.000Z');
    for (let i = 0; i < 3; i++) {
      const { token } = await createOnboardedPlayer(testSport._id, `ClockP${i}`, 1200 + i * 50);
      await request(app)
        .post(`/api/v1/games/${gameId}/join`)
        .set('Authorization', `Bearer ${token}`);
    }

    await TeamService.generateTeams(gameId, hostUser.id, clock);

    const event = await GameEvent.findOne({
      gameId: new Types.ObjectId(gameId),
      type: GameEventTypes.TEAMS_GENERATED,
    });
    expect(event).not.toBeNull();
    expect(event!.createdAt.toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });
});
