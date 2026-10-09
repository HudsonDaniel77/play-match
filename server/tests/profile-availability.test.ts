import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { OnboardingSteps } from '../src/constants/onboarding-steps.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';

describe('Player Profile: Availability Slots', () => {
  it('PUT /api/v1/profile/me/availability saves valid non-overlapping slots and marks availability complete', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const slots = [
      // Monday 6:00pm - 8:00pm (1080 - 1200)
      { dayOfWeek: 1, startMinute: 1080, endMinute: 1200 },
      // Monday 8:30pm - 10:00pm (1230 - 1320)
      { dayOfWeek: 1, startMinute: 1230, endMinute: 1320 },
      // Saturday 9:00am - 12:00pm (540 - 720)
      { dayOfWeek: 6, startMinute: 540, endMinute: 720 },
    ];

    const res = await request(app)
      .put('/api/v1/profile/me/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ slots });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availability.length).toBe(3);

    // Check onboarding status
    const statusRes = await request(app)
      .get('/api/v1/profile/me/onboarding')
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.body.data.completedSteps).toContain(
      OnboardingSteps.AVAILABILITY,
    );
  });

  it('rejects overlapping availability slots on the same day with 400', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // Slots overlap: 1000-1100 and 1050-1150
    const overlappingSlots = [
      { dayOfWeek: 2, startMinute: 1000, endMinute: 1100 },
      { dayOfWeek: 2, startMinute: 1050, endMinute: 1150 },
    ];

    const res = await request(app)
      .put('/api/v1/profile/me/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: overlappingSlots });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_AVAILABILITY);
  });

  it('rejects slots where startMinute >= endMinute', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const invalidSlots = [
      { dayOfWeek: 3, startMinute: 1200, endMinute: 1100 },
    ];

    const res = await request(app)
      .put('/api/v1/profile/me/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: invalidSlots });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rejects slots shorter than MIN_SLOT_DURATION_MINUTES (30 min)', async () => {
    const { user } = await createTestUser();
    const token = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    // 15 minute slot
    const shortSlots = [
      { dayOfWeek: 4, startMinute: 600, endMinute: 615 },
    ];

    const res = await request(app)
      .put('/api/v1/profile/me/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: shortSlots });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
