import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { type Application } from 'express';
import { app } from '../src/app.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { requireOnboardingComplete } from '../src/middleware/require-onboarding-complete.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { sendSuccess } from '../src/utils/api-response.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';

describe('Player Onboarding State Machine & Middleware Guard', () => {
  let testApp: Application;

  beforeAll(() => {
    testApp = express();
    testApp.use(express.json());
    // Sample protected matchmaker route requiring completed onboarding
    testApp.get(
      '/test/find-matches',
      authenticate,
      requireOnboardingComplete,
      (req, res) => sendSuccess(res, { matchmakingQueue: 'entered' }),
    );
    testApp.use(errorHandler);
  });

  it('reports missing steps and refuses completion if steps are incomplete', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // Initial status: all steps missing
    const status1 = await request(app)
      .get('/api/v1/profile/me/onboarding')
      .set('Authorization', `Bearer ${token}`);

    expect(status1.status).toBe(HttpStatus.OK);
    expect(status1.body.data.status).toBe(OnboardingStatuses.NOT_STARTED);
    expect(status1.body.data.missingSteps.length).toBe(5);

    // Attempting to complete onboarding fails with 400 and lists missing steps
    const failRes = await request(app)
      .post('/api/v1/profile/me/onboarding/complete')
      .set('Authorization', `Bearer ${token}`);

    expect(failRes.status).toBe(HttpStatus.BAD_REQUEST);
    expect(failRes.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(failRes.body.error.details.missingSteps).toBeDefined();

    // requireOnboardingComplete middleware rejects player with 403 Forbidden
    const guardRes = await request(testApp)
      .get('/test/find-matches')
      .set('Authorization', `Bearer ${token}`);

    expect(guardRes.status).toBe(HttpStatus.FORBIDDEN);
    expect(guardRes.body.error.code).toBe(ErrorCodes.ONBOARDING_INCOMPLETE);
  });

  it('completes onboarding after completing all steps and allows access through guard', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const sport = await createTestSport();

    // 1. Basic Info
    await request(app)
      .put('/api/v1/profile/me/basic')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Complete Player' });

    // 2. Sports Selection
    await request(app)
      .put('/api/v1/profile/me/sports')
      .set('Authorization', `Bearer ${token}`)
      .send({ sports: [{ sportId: sport.id, selectedBandKey: 'intermediate' }] });

    // 3. Availability
    await request(app)
      .put('/api/v1/profile/me/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ dayOfWeek: 0, startMinute: 600, endMinute: 720 }] });

    // 4. Location
    await request(app)
      .put('/api/v1/profile/me/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ coordinates: [0.1276, 51.5072], locationLabel: 'London' });

    // 5. Preferences
    await request(app)
      .put('/api/v1/profile/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ visibility: { profile: 'public' } });

    // Verify all steps are satisfied
    const statusRes = await request(app)
      .get('/api/v1/profile/me/onboarding')
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.body.data.missingSteps.length).toBe(0);

    // Complete onboarding
    const completeRes = await request(app)
      .post('/api/v1/profile/me/onboarding/complete')
      .set('Authorization', `Bearer ${token}`);

    expect(completeRes.status).toBe(HttpStatus.OK);
    expect(completeRes.body.data.onboarding.status).toBe(
      OnboardingStatuses.COMPLETED,
    );
    expect(completeRes.body.data.onboarding.completedAt).toBeDefined();

    // requireOnboardingComplete middleware now allows access!
    const accessRes = await request(testApp)
      .get('/test/find-matches')
      .set('Authorization', `Bearer ${token}`);

    expect(accessRes.status).toBe(HttpStatus.OK);
    expect(accessRes.body.data.matchmakingQueue).toBe('entered');
  });
});
