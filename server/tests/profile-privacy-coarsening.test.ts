import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import {
  ProfileVisibility,
  LocationVisibility,
  RatingVisibility,
} from '../src/constants/visibility.js';
import { config } from '../src/config/index.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';

describe('Player Profile: Privacy by Design & Location Coarsening', () => {
  it('public profile returns coarsened coordinates and hides email and exact coords', async () => {
    const { user } = await createTestUser({ email: 'secret.email@example.com' });
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const sport = await createTestSport({ name: 'Public Tennis' });

    // Set precise location: [-122.419415, 37.774929]
    await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${token}`)
      .send({
        coordinates: [-122.419415, 37.774929],
        locationLabel: 'Downtown SF',
      });

    // Select sport
    await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sports: [{ sportId: sport.id, selectedBandKey: 'intermediate' }],
      });

    // Request public profile view
    const res = await request(app).get(`/api/v1/profiles/${user.id}`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);

    const publicData = res.body.data;

    // Security check 1: Exact coordinates must NEVER be present
    expect(JSON.stringify(publicData)).not.toContain('-122.419415');
    expect(JSON.stringify(publicData)).not.toContain('37.774929');

    // Security check 2: Email must NEVER be present
    expect(JSON.stringify(publicData)).not.toContain('secret.email@example.com');

    // Verify coordinates are coarsened to LOCATION_PUBLIC_PRECISION_DECIMALS (2 decimals -> [-122.42, 37.77])
    expect(publicData.location).toBeDefined();
    expect(publicData.location.coordinates).toEqual([-122.42, 37.77]);
    expect(publicData.location.label).toBe('Downtown SF');

    // Sports include rating and provisional flag
    expect(publicData.sports.length).toBe(1);
    expect(publicData.sports[0].rating).toBe(1200);
    expect(publicData.sports[0].provisional).toBe(true);
  });

  it('omits location when visibility.location is set to hidden', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ coordinates: [-122.4194, 37.7749], locationLabel: 'SF' });

    // Set location visibility to hidden
    await request(app)
      .put('/api/v1/profile/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        visibility: { location: LocationVisibility.HIDDEN },
      });

    const res = await request(app).get(`/api/v1/profiles/${user.id}`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.location).toBeNull();
  });

  it('omits rating when visibility.ratings is set to hidden', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const sport = await createTestSport();
    await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({ sports: [{ sportId: sport.id, selectedBandKey: 'beginner' }] });

    // Hide ratings
    await request(app)
      .put('/api/v1/profile/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        visibility: { ratings: RatingVisibility.HIDDEN },
      });

    const res = await request(app).get(`/api/v1/profiles/${user.id}`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.sports[0].rating).toBeUndefined();
    expect(res.body.data.sports[0].bandLabel).toBeDefined();
  });

  it('rejects public view with 403 Forbidden when profile is private', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // Make profile private
    await request(app)
      .put('/api/v1/profile/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        visibility: { profile: ProfileVisibility.PRIVATE },
      });

    const res = await request(app).get(`/api/v1/profiles/${user.id}`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.error.code).toBe(ErrorCodes.PROFILE_PRIVATE);
  });
});
