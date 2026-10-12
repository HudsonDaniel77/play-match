import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { Rating } from '../src/models/rating.model.js';
import { Profile } from '../src/models/profile.model.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { RatingVisibility, ProfileVisibility } from '../src/constants/visibility.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';

describe('Leaderboard Endpoint Tests', () => {
  it('respects provisional filtering and privacy settings on sport leaderboard', async () => {
    const { user: requester } = await createTestUser();
    const { user: publicVeteran } = await createTestUser({ name: 'Public Veteran' });
    const { user: provisionalPlayer } = await createTestUser({ name: 'Provisional Player' });
    const { user: hiddenRatingsPlayer } = await createTestUser({ name: 'Secret Rating Player' });
    const { user: privateProfilePlayer } = await createTestUser({ name: 'Private Player' });

    const sport = await createTestSport({
      key: 'table_tennis_pro',
      name: 'Table Tennis Pro',
    });

    const token = tokenService.generateAccessToken({
      userId: requester.id,
      role: requester.role,
      email: requester.email,
    });

    // 1. Veteran with public profile and 15 games (not provisional) -> rating 1500
    await Profile.create({
      user: publicVeteran._id,
      displayName: 'Public Veteran',
      visibility: { profile: ProfileVisibility.PUBLIC, ratings: RatingVisibility.PUBLIC },
    });
    await Rating.create({
      user: publicVeteran._id,
      sport: sport._id,
      rating: 1500,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 15,
      peakRating: 1500,
    });

    // 2. Provisional player (only 2 games played) -> rating 1600 (higher rating, but provisional!)
    await Profile.create({
      user: provisionalPlayer._id,
      displayName: 'Provisional Player',
      visibility: { profile: ProfileVisibility.PUBLIC, ratings: RatingVisibility.PUBLIC },
    });
    await Rating.create({
      user: provisionalPlayer._id,
      sport: sport._id,
      rating: 1600,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 2, // provisional!
      peakRating: 1600,
    });

    // 3. Veteran with hidden ratings (20 games) -> rating 1700
    await Profile.create({
      user: hiddenRatingsPlayer._id,
      displayName: 'Secret Rating Player',
      visibility: { profile: ProfileVisibility.PUBLIC, ratings: RatingVisibility.HIDDEN },
    });
    await Rating.create({
      user: hiddenRatingsPlayer._id,
      sport: sport._id,
      rating: 1700,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 20,
      peakRating: 1700,
    });

    // 4. Veteran with private profile (20 games) -> rating 1800
    await Profile.create({
      user: privateProfilePlayer._id,
      displayName: 'Private Player',
      visibility: { profile: ProfileVisibility.PRIVATE, ratings: RatingVisibility.PUBLIC },
    });
    await Rating.create({
      user: privateProfilePlayer._id,
      sport: sport._id,
      rating: 1800,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 20,
      peakRating: 1800,
    });

    // Query leaderboard
    const res = await request(app)
      .get(`/api/v1/leaderboards/${sport.key}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);

    const entries = res.body.data.entries;

    // Must ONLY include Public Veteran!
    // Provisional Player is filtered out by LEADERBOARD_EXCLUDE_PROVISIONAL (gamesPlayed < 10)
    // Hidden Ratings Player is filtered out by visibility.ratings === HIDDEN
    // Private Player is filtered out by visibility.profile === PRIVATE
    expect(entries.length).toBe(1);
    expect(entries[0].displayName).toBe('Public Veteran');
    expect(entries[0].rating).toBe(1500);
    expect(entries[0].provisional).toBe(false);
  });

  it('rejects unauthenticated requests to leaderboard', async () => {
    const res = await request(app).get('/api/v1/leaderboards/football');
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
  });
});
