import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { OnboardingSteps } from '../src/constants/onboarding-steps.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';

describe('Player Profile: Basic Info', () => {
  it('PUT /api/v1/profile/me/basic updates basic profile fields and marks basic_info complete', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const payload = {
      displayName: 'Jordan "Ace" Smith',
      bio: 'Lifelong badminton enthusiast looking for competitive doubles rallies.',
      avatarUrl: 'https://example.com/avatars/jordan.png',
      dateOfBirth: '1995-06-15',
      timezone: 'America/New_York',
    };

    const res = await request(app)
      .put('/api/v1/profile/me/basic')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile.displayName).toBe('Jordan "Ace" Smith');
    expect(res.body.data.profile.bio).toContain('badminton enthusiast');
    expect(res.body.data.profile.timezone).toBe('America/New_York');
    expect(res.body.data.profile.onboarding.completedSteps).toContain(
      OnboardingSteps.BASIC_INFO,
    );
  });

  it('rejects invalid IANA timezone', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const res = await request(app)
      .put('/api/v1/profile/me/basic')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Jordan Smith',
        timezone: 'Fantasy/Narnia_Standard_Time',
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_TIMEZONE);
  });

  it('rejects implausible date of birth (e.g. age < 13 or > 100)', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // Too young: 2 years old
    const futureDob = new Date();
    futureDob.setFullYear(futureDob.getFullYear() - 2);

    const res = await request(app)
      .put('/api/v1/profile/me/basic')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Toddler Prodigy',
        dateOfBirth: futureDob.toISOString(),
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .put('/api/v1/profile/me/basic')
      .send({ displayName: 'Anonymous Hacker' });

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_UNAUTHORIZED);
  });
});
