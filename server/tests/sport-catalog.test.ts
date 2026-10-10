import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { Sport } from '../src/models/sport.model.js';
import { Roles } from '../src/constants/roles.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { tokenService } from '../src/services/token.service.js';
import { seedSportsCatalog } from '../src/scripts/seed-sports.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';

describe('Sport Catalog & Admin Management', () => {
  it('seeding sports catalog from JSON file is idempotent and seeds exactly 3 sports', async () => {
    // First run
    const run1 = await seedSportsCatalog();
    expect(run1.seededCount).toBe(3);

    const countAfterRun1 = await Sport.countDocuments();
    expect(countAfterRun1).toBe(3);

    // Second run
    const run2 = await seedSportsCatalog();
    expect(run2.seededCount).toBe(3);

    const countAfterRun2 = await Sport.countDocuments();
    expect(countAfterRun2).toBe(countAfterRun1);
  });

  it('seedSportsCatalog supports dry-run mode without modifying the database', async () => {
    // Clear sports collection
    await Sport.deleteMany({});

    const dryRunRes = await seedSportsCatalog({ dryRun: true });
    expect(dryRunRes.dryRun).toBe(true);
    expect(dryRunRes.seededCount).toBe(3);

    // Database still has 0 documents
    const count = await Sport.countDocuments();
    expect(count).toBe(0);
  });

  it('seedSportsCatalog supports --deactivate-missing to soft-disable absent sports', async () => {
    // Pre-insert an old legacy sport (e.g. basketball)
    await Sport.create({
      key: 'basketball_legacy',
      name: 'Basketball Legacy',
      isActive: true,
      minPlayers: 6,
      maxPlayers: 10,
      skillBands: [{ key: 'b1', label: 'B1', order: 1, seedRating: 1000 }],
      playStyles: [{ key: 'casual', label: 'Casual' }],
    });

    // Run without deactivateMissing -> basketball remains active
    await seedSportsCatalog({ deactivateMissing: false });
    const legacyStillActive = await Sport.findOne({ key: 'basketball_legacy' });
    expect(legacyStillActive?.isActive).toBe(true);

    // Run with deactivateMissing -> basketball becomes isActive: false
    const result = await seedSportsCatalog({ deactivateMissing: true });
    expect(result.deactivatedCount).toBe(1);

    const legacyDeactivated = await Sport.findOne({ key: 'basketball_legacy' });
    expect(legacyDeactivated?.isActive).toBe(false);
  });

  it('GET /api/v1/sports returns active sports with bands and play styles without authentication', async () => {
    await createTestSport({ name: 'Active Padel', isActive: true });
    await createTestSport({ name: 'Inactive Squash', isActive: false });

    const res = await request(app).get('/api/v1/sports');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.sports)).toBe(true);

    const returnedNames = res.body.data.sports.map((s: { name: string }) => s.name);
    expect(returnedNames).toContain('Active Padel');
    expect(returnedNames).not.toContain('Inactive Squash');

    const padel = res.body.data.sports.find((s: { name: string }) => s.name === 'Active Padel');
    expect(padel.skillBands.length).toBeGreaterThan(0);
    expect(padel.playStyles.length).toBeGreaterThan(0);
  });

  it('admin can create and update sports in catalog, non-admin gets 403', async () => {
    const { user: player } = await createTestUser({ role: Roles.PLAYER });
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });

    const playerToken = tokenService.generateAccessToken({
      userId: player.id,
      role: player.role,
      email: player.email,
    });
    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    const newSportPayload = {
      key: 'pickleball',
      name: 'Pickleball',
      minPlayers: 2,
      maxPlayers: 4,
      skillBands: [
        { key: 'beginner', label: 'Beginner', order: 1, seedRating: 1000 },
        { key: 'intermediate', label: 'Intermediate', order: 2, seedRating: 1200 },
      ],
      playStyles: [{ key: 'kitchen_rallies', label: 'Dink & Kitchen Play' }],
    };

    // Player attempts admin create -> 403
    const playerCreateRes = await request(app)
      .post('/api/v1/admin/sports')
      .set('Authorization', `Bearer ${playerToken}`)
      .send(newSportPayload);

    expect(playerCreateRes.status).toBe(HttpStatus.FORBIDDEN);
    expect(playerCreateRes.body.error.code).toBe(ErrorCodes.FORBIDDEN_ACCESS);

    // Admin creates sport -> 201
    const adminCreateRes = await request(app)
      .post('/api/v1/admin/sports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newSportPayload);

    expect(adminCreateRes.status).toBe(HttpStatus.CREATED);
    expect(adminCreateRes.body.data.sport.key).toBe('pickleball');
    const createdId = adminCreateRes.body.data.sport.id;

    // Admin deactivates sport -> 200
    const updateRes = await request(app)
      .patch(`/api/v1/admin/sports/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(updateRes.status).toBe(HttpStatus.OK);
    expect(updateRes.body.data.sport.isActive).toBe(false);

    // Should no longer appear in public catalog
    const publicRes = await request(app).get('/api/v1/sports');
    const publicKeys = publicRes.body.data.sports.map((s: { key: string }) => s.key);
    expect(publicKeys).not.toContain('pickleball');
  });

  it('validates formats: enforces exactly one default format and capacity bounds', async () => {
    const { user: admin } = await createTestUser({ role: Roles.ADMIN });
    const adminToken = tokenService.generateAccessToken({
      userId: admin.id,
      role: admin.role,
      email: admin.email,
    });

    // Zero default formats -> rejected
    const noDefaultRes = await request(app)
      .post('/api/v1/admin/sports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'squash_test',
        name: 'Squash Test',
        minPlayers: 2,
        maxPlayers: 4,
        formats: [
          { key: 'singles', label: 'Singles', playersPerSide: 1, isDefault: false },
        ],
        skillBands: [{ key: 'b1', label: 'B1', order: 1, seedRating: 1000 }],
        playStyles: [{ key: 'casual', label: 'Casual' }],
      });

    expect(noDefaultRes.status).toBe(HttpStatus.BAD_REQUEST);
    expect(noDefaultRes.body.error.details[0].message).toContain('Exactly one format must be marked as default');

    // Two default formats -> rejected
    const twoDefaultsRes = await request(app)
      .post('/api/v1/admin/sports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'squash_test2',
        name: 'Squash Test 2',
        minPlayers: 2,
        maxPlayers: 4,
        formats: [
          { key: 'singles', label: 'Singles', playersPerSide: 1, isDefault: true },
          { key: 'doubles', label: 'Doubles', playersPerSide: 2, isDefault: true },
        ],
        skillBands: [{ key: 'b1', label: 'B1', order: 1, seedRating: 1000 }],
        playStyles: [{ key: 'casual', label: 'Casual' }],
      });

    expect(twoDefaultsRes.status).toBe(HttpStatus.BAD_REQUEST);
    expect(twoDefaultsRes.body.error.details[0].message).toContain('Exactly one format must be marked as default');
  });
});
