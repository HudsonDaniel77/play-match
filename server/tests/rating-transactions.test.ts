import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { Rating } from '../src/models/rating.model.js';
import { MatchResult } from '../src/models/match-result.model.js';
import { RatingEvent } from '../src/models/rating-event.model.js';
import { Roles } from '../src/constants/roles.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';

describe('Rating Transactions & Concurrency Tests', () => {
  it('guarantees atomicity: when one player update fails, zero changes persist', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const { user: playerA } = await createTestUser();
    const { user: playerB } = await createTestUser();
    const sport = await createTestSport({ minPlayers: 1, maxPlayers: 1 });

    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    // Player A has a Rating record, but Player B does NOT have a Rating record
    await Rating.create({
      user: playerA._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
    });

    const res = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sport.key,
        source: { type: 'admin_manual', id: 'atomicity-fail-1' },
        sides: [
          { sideKey: 'side_a', playerIds: [playerA.id], score: 21 },
          { sideKey: 'side_b', playerIds: [playerB.id], score: 10 },
        ],
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.PLAYER_RATING_NOT_FOUND);

    // Atomicity assertion: Player A's rating was NOT touched
    const checkA = await Rating.findOne({ user: playerA._id, sport: sport._id });
    expect(checkA!.rating).toBe(1200);
    expect(checkA!.gamesPlayed).toBe(0);

    // No MatchResult or RatingEvent was persisted
    const matchCount = await MatchResult.countDocuments();
    expect(matchCount).toBe(0);

    const eventCount = await RatingEvent.countDocuments();
    expect(eventCount).toBe(0);
  });

  it('handles concurrent match applications for the same player safely', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const { user: playerShared } = await createTestUser();
    const { user: playerX } = await createTestUser();
    const { user: playerY } = await createTestUser();
    const sport = await createTestSport({ minPlayers: 1, maxPlayers: 1 });

    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    await Rating.create({
      user: playerShared._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
    });

    await Rating.create({
      user: playerX._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
    });

    await Rating.create({
      user: playerY._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
    });

    // Execute match 1
    const res1 = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sport.key,
        source: { type: 'admin_manual', id: 'concurrent-match-1' },
        sides: [
          { sideKey: 'side_a', playerIds: [playerShared.id], score: 21 },
          { sideKey: 'side_b', playerIds: [playerX.id], score: 18 },
        ],
      });

    // Execute match 2
    const res2 = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sport.key,
        source: { type: 'admin_manual', id: 'concurrent-match-2' },
        sides: [
          { sideKey: 'side_a', playerIds: [playerShared.id], score: 21 },
          { sideKey: 'side_b', playerIds: [playerY.id], score: 14 },
        ],
      });

    expect(res1.status).toBe(HttpStatus.CREATED);
    expect(res2.status).toBe(HttpStatus.CREATED);

    const finalShared = await Rating.findOne({ user: playerShared._id, sport: sport._id });
    expect(finalShared!.gamesPlayed).toBe(2);
    expect(finalShared!.wins).toBe(2);
    expect(finalShared!.rating).toBeGreaterThan(1200);
  });
});
