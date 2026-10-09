import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { Rating } from '../src/models/rating.model.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';

describe('Player Profile: Sports & Seed Ratings', () => {
  it('choosing a sport creates SportProfile and Rating using the band seed rating', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const sport = await createTestSport({ name: 'Badminton Championship' });

    const res = await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [
          {
            sportId: sport.id,
            selectedBandKey: 'intermediate',
            playStyle: 'competitive',
            preferredPositions: ['singles'],
          },
        ],
      });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);

    // Verify SportProfile created in DB
    const sp = await SportProfile.findOne({ user: user.id, sport: sport.id });
    expect(sp).toBeDefined();
    expect(sp?.selectedBandKey).toBe('intermediate');
    expect(sp?.isActive).toBe(true);

    // Verify Rating created in DB with intermediate seed rating (1200)
    const ratingDoc = await Rating.findOne({ user: user.id, sport: sport.id });
    expect(ratingDoc).toBeDefined();
    expect(ratingDoc?.rating).toBe(1200);
    expect(ratingDoc?.seedRating).toBe(1200);
    expect(ratingDoc?.gamesPlayed).toBe(0);
    expect(ratingDoc?.isProvisional()).toBe(true);
  });

  it('rejects/ignores client-submitted rating value (Non-Negotiable Rule 6)', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const sport = await createTestSport({ name: 'Table Tennis League' });

    // Client attempts to sneak in a high rating of 2500!
    const res = await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [
          {
            sportId: sport.id,
            selectedBandKey: 'beginner', // seed rating is 1000
            rating: 2500, // Client injected rating!
          },
        ],
      });

    // Zod strict validation rejects the unknown injected property
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);

    // Ensure database was NOT updated with client rating
    const ratingDoc = await Rating.findOne({ user: user.id, sport: sport.id });
    expect(ratingDoc).toBeNull();
  });

  it('allows band change when gamesPlayed === 0 and blocks change when gamesPlayed > 0', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const sport = await createTestSport({ name: 'Squash Masters' });

    // 1. Initial selection: beginner (1000)
    await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [{ sportId: sport.id, selectedBandKey: 'beginner' }],
      });

    let ratingDoc = await Rating.findOne({ user: user.id, sport: sport.id });
    expect(ratingDoc?.rating).toBe(1000);

    // 2. Change band while gamesPlayed === 0: succeeds, updates to advanced (1400)
    const updateRes = await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [{ sportId: sport.id, selectedBandKey: 'advanced' }],
      });

    expect(updateRes.status).toBe(HttpStatus.OK);
    ratingDoc = await Rating.findOne({ user: user.id, sport: sport.id });
    expect(ratingDoc?.rating).toBe(1400);
    expect(ratingDoc?.seedBandKey).toBe('advanced');

    // 3. Simulate games played > 0 (e.g. after Module 3 match simulation)
    ratingDoc!.gamesPlayed = 5;
    await ratingDoc!.save();

    // 4. Attempting to change band now MUST be blocked with 409 Conflict
    const blockedRes = await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [{ sportId: sport.id, selectedBandKey: 'beginner' }],
      });

    expect(blockedRes.status).toBe(HttpStatus.CONFLICT);
    expect(blockedRes.body.error.code).toBe(ErrorCodes.RATING_LOCKED_AFTER_GAMES);
  });

  it('soft-removes sport when omitted from selection but preserves Rating history', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const sport1 = await createTestSport({ name: 'Sport One' });
    const sport2 = await createTestSport({ name: 'Sport Two' });

    // Select both sports
    await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [
          { sportId: sport1.id, selectedBandKey: 'beginner' },
          { sportId: sport2.id, selectedBandKey: 'intermediate' },
        ],
      });

    // Remove sport2 by omitting it
    const removeRes = await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [{ sportId: sport1.id, selectedBandKey: 'beginner' }],
      });

    expect(removeRes.status).toBe(HttpStatus.OK);

    // sport2 profile is soft-removed (isActive: false)
    const sp2 = await SportProfile.findOne({ user: user.id, sport: sport2.id });
    expect(sp2?.isActive).toBe(false);

    // sport2 rating is retained!
    const r2 = await Rating.findOne({ user: user.id, sport: sport2.id });
    expect(r2).toBeDefined();
    expect(r2?.rating).toBe(1200);
  });

  it('enforces MAX_SPORTS_PER_PLAYER limit', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // Create 6 sports (limit is 5)
    const sports = await Promise.all([
      createTestSport(),
      createTestSport(),
      createTestSport(),
      createTestSport(),
      createTestSport(),
      createTestSport(),
    ]);

    const res = await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: sports.map((s) => ({
          sportId: s.id,
          selectedBandKey: 'beginner',
        })),
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });
});
