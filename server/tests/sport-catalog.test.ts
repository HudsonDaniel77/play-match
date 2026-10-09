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
  it('seeding sports catalog from JSON file is idempotent', async () => {
    // First run
    const run1 = await seedSportsCatalog();
    expect(run1.seededCount).toBeGreaterThanOrEqual(4);

    const countAfterRun1 = await Sport.countDocuments();

    // Second run
    const run2 = await seedSportsCatalog();
    expect(run2.seededCount).toBe(run1.seededCount);

    const countAfterRun2 = await Sport.countDocuments();
    expect(countAfterRun2).toBe(countAfterRun1);
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
});
