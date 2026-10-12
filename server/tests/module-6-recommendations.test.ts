import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import {
  GameStatuses,
  JoinPolicies,
  GameVisibilities,
  ParticipantStatuses,
} from '../src/constants/game-constants.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { Profile } from '../src/models/profile.model.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Rating } from '../src/models/rating.model.js';
import { Game } from '../src/models/game.model.js';
import { GameParticipant } from '../src/models/game-participant.model.js';
import { PlayerReliability } from '../src/models/player-reliability.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { ReliabilityTiers } from '../src/constants/reliability-constants.js';

describe('Module 6: Recommendations API Endpoints', () => {
  let sportId: Types.ObjectId;
  let sportKey: string;

  beforeEach(async () => {
    const sport = await createTestSport({ key: 'badminton', name: 'Badminton' });
    sportId = sport._id;
    sportKey = sport.key;
  });

  async function createPlayerWithProfile(opts: {
    displayName: string;
    coords?: [number, number];
    travelRadiusKm?: number;
    rating?: number;
    gamesPlayed?: number;
    onboardingComplete?: boolean;
    availability?: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  }) {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const isOnboarded = opts.onboardingComplete !== false;

    await Profile.create({
      userId: user.id,
      user: user.id,
      displayName: opts.displayName,
      bio: 'Player bio',
      homeLocation: {
        type: 'Point',
        coordinates: opts.coords || [77.5946, 12.9716], // Bangalore center
      },
      travelRadiusKm: opts.travelRadiusKm || 15,
      availability: opts.availability || [
        { dayOfWeek: 5, startMinute: 1080, endMinute: 1200 }, // Friday 18:00 - 20:00
      ],
      visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
      onboarding: {
        status: isOnboarded
          ? OnboardingStatuses.COMPLETED
          : OnboardingStatuses.IN_PROGRESS,
        completedSteps: isOnboarded
          ? ['basic', 'sports', 'availability', 'location', 'preferences']
          : ['basic'],
        completedAt: isOnboarded ? new Date() : null,
      },
    });

    await SportProfile.create({
      userId: user.id,
      user: user.id,
      sport: sportId,
      selectedBandKey: 'intermediate',
      preferredPositions: ['singles'],
      isActive: true,
    });

    await Rating.create({
      userId: user.id,
      user: user.id,
      sport: sportId,
      rating: opts.rating ?? 1250,
      seedRating: opts.rating ?? 1250,
      seedBandKey: 'intermediate',
      gamesPlayed: opts.gamesPlayed ?? 15,
      peakRating: opts.rating ?? 1250,
      wins: 8,
      losses: 7,
      draws: 0,
      lastRatedAt: new Date(),
      history: [],
    });

    return { user, token };
  }

  async function createSampleGame(opts: {
    hostId: Types.ObjectId;
    title?: string;
    coords?: [number, number];
    startsAt?: Date;
    endsAt?: Date;
    minRating?: number;
    maxRating?: number;
    maxPlayers?: number;
    participantCount?: number;
    status?: any;
  }) {
    const now = new Date();
    const futureStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);

    return Game.create({
      hostId: opts.hostId,
      sportKey,
      formatKey: 'singles',
      status: opts.status || GameStatuses.OPEN,
      joinPolicy: JoinPolicies.OPEN,
      visibility: GameVisibilities.PUBLIC,
      minPlayers: 2,
      maxPlayers: opts.maxPlayers || 4,
      participantCount: opts.participantCount || 1,
      waitlistCount: 0,
      startsAt: opts.startsAt || futureStart,
      endsAt: opts.endsAt || futureEnd,
      location: {
        type: 'Point',
        coordinates: opts.coords || [77.6000, 12.9750], // ~1km away
      },
      ratingRange:
        opts.minRating !== undefined && opts.maxRating !== undefined
          ? { min: opts.minRating, max: opts.maxRating, allowUnrated: true }
          : undefined,
      isLocked: false,
      statusHistory: [],
    });
  }

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/recommendations');
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('rejects requests from users with incomplete onboarding with 403', async () => {
    const { token } = await createPlayerWithProfile({
      displayName: 'Incomplete User',
      onboardingComplete: false,
    });

    const res = await request(app)
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('returns empty list when no open candidate games exist', async () => {
    const { token } = await createPlayerWithProfile({
      displayName: 'Active Player',
    });

    const res = await request(app)
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  it('evaluates and returns recommended games matching contract', async () => {
    const { user: hostUser } = await createPlayerWithProfile({
      displayName: 'Host User',
    });

    // Create host reliability snapshot
    await PlayerReliability.create({
      userId: hostUser.id,
      score: 95,
      tier: ReliabilityTiers.PLATINUM,
      gamesCounted: 20,
      attendedGames: 19,
      onTimeLeaves: 1,
      lateLeaves: 0,
      noShows: 0,
      lastComputedAt: new Date(),
    });

    const game = await createSampleGame({
      hostId: new Types.ObjectId(hostUser.id),
      minRating: 1200,
      maxRating: 1300,
      maxPlayers: 4,
      participantCount: 2,
    });

    const { token } = await createPlayerWithProfile({
      displayName: 'Searcher Player',
      rating: 1240,
    });

    const res = await request(app)
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);

    const rec = res.body.data.items[0];
    expect(rec.gameId).toBe(game.id);
    expect(rec.sportKey).toBe('badminton');
    expect(rec.score).toBeGreaterThan(0.7);
    expect(['low', 'medium', 'high']).toContain(rec.confidence);
    expect(rec.factors).toBeInstanceOf(Array);
    expect(rec.factors.length).toBe(4);
    expect(rec.reasons).toBeInstanceOf(Array);
    expect(rec.reasons.length).toBeGreaterThan(0);
  });

  it('excludes games the caller has hosted or already joined', async () => {
    const { user: caller, token } = await createPlayerWithProfile({
      displayName: 'Self Host Player',
    });

    const { user: otherHost } = await createPlayerWithProfile({
      displayName: 'Other Host',
    });

    // 1. Game hosted by caller
    await createSampleGame({
      hostId: new Types.ObjectId(caller.id),
    });

    // 2. Game hosted by someone else, but caller already joined
    const joinedGame = await createSampleGame({
      hostId: new Types.ObjectId(otherHost.id),
    });
    await GameParticipant.create({
      gameId: joinedGame._id,
      userId: new Types.ObjectId(caller.id),
      role: 'player',
      status: ParticipantStatuses.JOINED,
      joinedAt: new Date(),
      startsAt: joinedGame.startsAt,
      endsAt: joinedGame.endsAt,
    });

    // 3. Eligible game
    const openGame = await createSampleGame({
      hostId: new Types.ObjectId(otherHost.id),
    });

    const res = await request(app)
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].gameId).toBe(openGame.id);
  });

  it('filters recommendations by query parameters (limit, minScore, maxDistanceKm)', async () => {
    const { user: hostUser } = await createPlayerWithProfile({
      displayName: 'Multi Host',
    });

    // Game 1: Very close (0.5 km)
    await createSampleGame({
      hostId: new Types.ObjectId(hostUser.id),
      coords: [77.5950, 12.9720],
    });

    // Game 2: Far away (50 km)
    await createSampleGame({
      hostId: new Types.ObjectId(hostUser.id),
      coords: [77.1000, 12.5000],
    });

    const { token } = await createPlayerWithProfile({
      displayName: 'Filtered Searcher',
      coords: [77.5946, 12.9716],
    });

    // Request with maxDistanceKm = 10
    const resDistance = await request(app)
      .get('/api/v1/recommendations?maxDistanceKm=10')
      .set('Authorization', `Bearer ${token}`);

    expect(resDistance.status).toBe(HttpStatus.OK);
    expect(resDistance.body.data.items).toHaveLength(1);

    // Request with limit = 1
    const resLimit = await request(app)
      .get('/api/v1/recommendations?limit=1')
      .set('Authorization', `Bearer ${token}`);

    expect(resLimit.status).toBe(HttpStatus.OK);
    expect(resLimit.body.data.items).toHaveLength(1);
  });
});
