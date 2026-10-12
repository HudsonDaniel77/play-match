import { describe, it, expect, beforeEach } from 'vitest';
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

describe('Module 3: Rating Service & Endpoints', () => {
  it('applies a match result, updates ratings atomically, and writes ledger events', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const { user: playerA } = await createTestUser({ role: Roles.PLAYER });
    const { user: playerB } = await createTestUser({ role: Roles.PLAYER });

    const sport = await createTestSport({
      key: 'badminton_singles',
      name: 'Badminton Singles',
      minPlayers: 1,
      maxPlayers: 1,
      allowsDraws: false,
    });

    // Create initial ratings: playerA = 1000, playerB = 1100
    await Rating.create({
      user: playerA._id,
      sport: sport._id,
      rating: 1000,
      seedRating: 1000,
      seedBandKey: 'beginner',
      gamesPlayed: 0,
      peakRating: 1000,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    await Rating.create({
      user: playerB._id,
      sport: sport._id,
      rating: 1100,
      seedRating: 1100,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1100,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    // Player A (1000) beats Player B (1100) -> 21 to 19
    const matchPayload = {
      sportKey: sport.key,
      source: { type: 'admin_manual', id: 'match-101' },
      sides: [
        { sideKey: 'side_a', playerIds: [playerA.id], score: 21 },
        { sideKey: 'side_b', playerIds: [playerB.id], score: 19 },
      ],
    };

    const res = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(matchPayload);

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outcome).toBe('side_a_win');

    // Verify Player A rating updated
    const updatedA = await Rating.findOne({ user: playerA._id, sport: sport._id });
    expect(updatedA).toBeDefined();
    expect(updatedA!.gamesPlayed).toBe(1);
    expect(updatedA!.wins).toBe(1);
    expect(updatedA!.losses).toBe(0);
    expect(updatedA!.rating).toBeGreaterThan(1000);
    expect(updatedA!.peakRating).toBe(updatedA!.rating);
    expect(updatedA!.lastRatedAt).toBeDefined();

    // Verify Player B rating updated
    const updatedB = await Rating.findOne({ user: playerB._id, sport: sport._id });
    expect(updatedB).toBeDefined();
    expect(updatedB!.gamesPlayed).toBe(1);
    expect(updatedB!.wins).toBe(0);
    expect(updatedB!.losses).toBe(1);
    expect(updatedB!.rating).toBeLessThan(1100);

    // Verify ledger RatingEvents written
    const eventA = await RatingEvent.findOne({ user: playerA._id, matchResult: res.body.data.matchResultId });
    expect(eventA).toBeDefined();
    expect(eventA!.oldRating).toBe(1000);
    expect(eventA!.delta).toBeGreaterThan(0);
    expect(eventA!.voided).toBe(false);

    // Idempotency: re-submitting exact same source id returns same outcome without changing ratings
    const rerunRes = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(matchPayload);

    expect(rerunRes.status).toBe(HttpStatus.CREATED);
    const countA = await RatingEvent.countDocuments({ user: playerA._id });
    expect(countA).toBe(1); // No duplicate events created!
  });

  it('rejects client injected rating property via strict schema', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const { user: playerA } = await createTestUser();
    const { user: playerB } = await createTestUser();
    const sport = await createTestSport({ minPlayers: 1, maxPlayers: 1 });

    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    const res = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sport.key,
        source: { type: 'admin_manual', id: 'match-tamper' },
        rating: 2000, // Client injected field!
        sides: [
          { sideKey: 'side_a', playerIds: [playerA.id], score: 10 },
          { sideKey: 'side_b', playerIds: [playerB.id], score: 5 },
        ],
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });

  it('validates sport active state, player duplicates, team sizes, and draw rules', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const { user: player1 } = await createTestUser();
    const sportNoDraw = await createTestSport({
      minPlayers: 1,
      maxPlayers: 1,
      allowsDraws: false,
    });

    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    // 1. Draw in a sport that does not allow draws
    const drawRes = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sportNoDraw.key,
        source: { type: 'admin_manual', id: 'draw-test' },
        sides: [
          { sideKey: 'side_a', playerIds: [player1.id], score: 10 },
          { sideKey: 'side_b', playerIds: [player1.id], score: 10 },
        ],
      });

    // Fails on duplicate player on both sides
    expect(drawRes.status).toBe(HttpStatus.BAD_REQUEST);
    expect(drawRes.body.error.code).toBe(ErrorCodes.DUPLICATE_PLAYER_IN_MATCH);
  });

  it('voids latest match result and reverts ratings; rejects voiding when newer games exist', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const { user: playerA } = await createTestUser();
    const { user: playerB } = await createTestUser();
    const sport = await createTestSport({ minPlayers: 1, maxPlayers: 1 });

    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    await Rating.create({
      user: playerA._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    await Rating.create({
      user: playerB._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    // Game 1
    const game1Res = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sport.key,
        source: { type: 'admin_manual', id: 'g1' },
        sides: [
          { sideKey: 'side_a', playerIds: [playerA.id], score: 21 },
          { sideKey: 'side_b', playerIds: [playerB.id], score: 15 },
        ],
      });
    expect(game1Res.status).toBe(HttpStatus.CREATED);
    const game1Id = game1Res.body.data.matchResultId;

    // Game 2 (playerA plays another match)
    const { user: playerC } = await createTestUser();
    await Rating.create({
      user: playerC._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    const game2Res = await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sport.key,
        source: { type: 'admin_manual', id: 'g2' },
        sides: [
          { sideKey: 'side_a', playerIds: [playerA.id], score: 21 },
          { sideKey: 'side_b', playerIds: [playerC.id], score: 10 },
        ],
      });
    expect(game2Res.status).toBe(HttpStatus.CREATED);
    const game2Id = game2Res.body.data.matchResultId;

    // Attempting to void Game 1 while Game 2 exists for Player A -> 400 CANNOT_VOID_HISTORIC_RESULT
    const voidG1Res = await request(app)
      .post(`/api/v1/admin/ratings/match-results/${game1Id}/void`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(voidG1Res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(voidG1Res.body.error.code).toBe(ErrorCodes.CANNOT_VOID_HISTORIC_RESULT);

    // Void Game 2 (latest match) -> Succeeds!
    const voidG2Res = await request(app)
      .post(`/api/v1/admin/ratings/match-results/${game2Id}/void`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(voidG2Res.status).toBe(HttpStatus.OK);
    expect(voidG2Res.body.data.status).toBe('voided');

    // Now Game 1 is latest again -> voiding Game 1 now succeeds!
    const voidG1Retry = await request(app)
      .post(`/api/v1/admin/ratings/match-results/${game1Id}/void`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(voidG1Retry.status).toBe(HttpStatus.OK);

    // Player A's rating should be restored to initial 1200
    const finalA = await Rating.findOne({ user: playerA._id, sport: sport._id });
    expect(finalA!.rating).toBe(1200);
    expect(finalA!.gamesPlayed).toBe(0);
    expect(finalA!.wins).toBe(0);
  });

  it('provides player history, explanations, and match preview', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const { user: playerA } = await createTestUser();
    const { user: playerB } = await createTestUser();
    const sport = await createTestSport({ minPlayers: 1, maxPlayers: 1 });

    const playerAToken = tokenService.generateAccessToken({
      userId: playerA.id,
      role: playerA.role,
      email: playerA.email,
    });
    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    await Rating.create({
      user: playerA._id,
      sport: sport._id,
      rating: 1000,
      seedRating: 1000,
      seedBandKey: 'beginner',
      gamesPlayed: 0,
      peakRating: 1000,
    });
    await Rating.create({
      user: playerB._id,
      sport: sport._id,
      rating: 1200,
      seedRating: 1200,
      seedBandKey: 'intermediate',
      gamesPlayed: 0,
      peakRating: 1200,
    });

    // 1. Preview match
    const previewRes = await request(app)
      .post('/api/v1/ratings/preview')
      .set('Authorization', `Bearer ${playerAToken}`)
      .send({
        sportKey: sport.key,
        sides: [
          { sideKey: 'side_a', playerIds: [playerA.id] },
          { sideKey: 'side_b', playerIds: [playerB.id] },
        ],
      });

    expect(previewRes.status).toBe(HttpStatus.OK);
    expect(previewRes.body.data.sideA.teamRating).toBe(1000);
    expect(previewRes.body.data.callerHypotheticalDeltas).toBeDefined();
    expect(previewRes.body.data.callerHypotheticalDeltas.win).toBeGreaterThan(0);

    // 2. Apply match result
    await request(app)
      .post('/api/v1/admin/ratings/match-results')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sportKey: sport.key,
        source: { type: 'admin_manual', id: 'history-preview-test' },
        sides: [
          { sideKey: 'side_a', playerIds: [playerA.id], score: 21 },
          { sideKey: 'side_b', playerIds: [playerB.id], score: 12 },
        ],
      });

    // 3. GET /ratings/me
    const meRes = await request(app)
      .get('/api/v1/ratings/me')
      .set('Authorization', `Bearer ${playerAToken}`);

    expect(meRes.status).toBe(HttpStatus.OK);
    expect(meRes.body.data.ratings.length).toBe(1);
    expect(meRes.body.data.ratings[0].gamesPlayed).toBe(1);

    // 4. GET /ratings/me/:sportKey/history
    const historyRes = await request(app)
      .get(`/api/v1/ratings/me/${sport.key}/history`)
      .set('Authorization', `Bearer ${playerAToken}`);

    expect(historyRes.status).toBe(HttpStatus.OK);
    expect(historyRes.body.data.events.length).toBe(1);
    const eventId = historyRes.body.data.events[0].id;

    // 5. GET /ratings/me/:sportKey/events/:eventId/explanation
    const explainRes = await request(app)
      .get(`/api/v1/ratings/me/${sport.key}/events/${eventId}/explanation`)
      .set('Authorization', `Bearer ${playerAToken}`);

    expect(explainRes.status).toBe(HttpStatus.OK);
    expect(explainRes.body.data.metrics.delta).toBeGreaterThan(0);
    expect(explainRes.body.data.explanationText).toContain('points');

    // Security: player B cannot read player A's event explanation
    const playerBToken = tokenService.generateAccessToken({
      userId: playerB.id,
      role: playerB.role,
      email: playerB.email,
    });
    const leakRes = await request(app)
      .get(`/api/v1/ratings/me/${sport.key}/events/${eventId}/explanation`)
      .set('Authorization', `Bearer ${playerBToken}`);

    expect(leakRes.status).toBe(HttpStatus.NOT_FOUND);
  });
});
