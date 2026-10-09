import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { Profile } from '../src/models/profile.model.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { OnboardingSteps } from '../src/constants/onboarding-steps.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';

describe('Player Profile: Location & 2dsphere Geospatial Index', () => {
  it('PUT /api/v1/profile/me/location saves valid coordinates and marks location complete', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // San Francisco coords: [-122.4194, 37.7749]
    const payload = {
      coordinates: [-122.4194, 37.7749],
      locationLabel: 'Mission District, San Francisco',
      travelRadiusKm: 25,
    };

    const res = await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.homeLocation.coordinates).toEqual([-122.4194, 37.7749]);
    expect(res.body.data.locationLabel).toBe('Mission District, San Francisco');
    expect(res.body.data.travelRadiusKm).toBe(25);

    // Verify database record
    const profile = await Profile.findOne({ user: user.id });
    expect(profile?.onboarding.completedSteps).toContain(OnboardingSteps.LOCATION);
  });

  it('rejects out-of-range geographic coordinates', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // Invalid longitude: 200 (must be -180 to 180)
    const res = await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${token}`)
      .send({
        coordinates: [200, 45],
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('2dsphere geospatial index works with $near query (Module 5 readiness)', async () => {
    // Player A: Central SF [-122.4194, 37.7749]
    const { user: userA } = await createTestUser({ email: 'playerA@sf.com' });
    const tokenA = tokenService.generateAccessToken({
      userId: userA.id,
      role: userA.role,
      email: userA.email,
    });
    await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ coordinates: [-122.4194, 37.7749] });

    // Player B: Oakland [-122.2712, 37.8044] (~13 km from SF)
    const { user: userB } = await createTestUser({ email: 'playerB@oakland.com' });
    const tokenB = tokenService.generateAccessToken({
      userId: userB.id,
      role: userB.role,
      email: userB.email,
    });
    await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ coordinates: [-122.2712, 37.8044] });

    // Player C: New York [-74.006, 40.7128] (~4000 km away)
    const { user: userC } = await createTestUser({ email: 'playerC@nyc.com' });
    const tokenC = tokenService.generateAccessToken({
      userId: userC.id,
      role: userC.role,
      email: userC.email,
    });
    await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ coordinates: [-74.006, 40.7128] });

    // Ensure 2dsphere indexes are built
    await Profile.syncIndexes();

    // Perform $near geospatial query centered on SF searching within 20km (20,000 meters)
    const nearbyPlayers = await Profile.find({
      homeLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749],
          },
          $maxDistance: 20000, // 20km
        },
      },
    });

    const nearbyUserIds = nearbyPlayers.map((p) => String(p.user));

    // Player A and Player B should be found; Player C should be excluded
    expect(nearbyUserIds).toContain(userA.id);
    expect(nearbyUserIds).toContain(userB.id);
    expect(nearbyUserIds).not.toContain(userC.id);
  });
});
