import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { Messages } from '../src/constants/messages.js';
import { config } from '../src/config/index.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('Account Lockout Flow', () => {
  it('locks account after MAX_FAILED_LOGINS failed attempts', async () => {
    const email = 'lockout.test@example.com';
    const { user } = await createTestUser({ email });

    // Submit MAX_FAILED_LOGINS wrong attempts
    for (let i = 0; i < config.MAX_FAILED_LOGINS; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword123!' });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.error.code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
    }

    // Next attempt must trigger account locked
    const lockedRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword123!' });

    expect(lockedRes.status).toBe(HttpStatus.LOCKED);
    expect(lockedRes.body.error.code).toBe(ErrorCodes.AUTH_ACCOUNT_LOCKED);
    expect(lockedRes.body.error.message).toBe(Messages.AUTH_ACCOUNT_LOCKED);

    // Even with the CORRECT password, locked account is blocked
    const correctPassRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: VALID_TEST_PASSWORD });

    expect(correctPassRes.status).toBe(HttpStatus.LOCKED);
    expect(correctPassRes.body.error.code).toBe(ErrorCodes.AUTH_ACCOUNT_LOCKED);

    // Verify lock status in database
    const dbUser = await User.findById(user.id);
    expect(dbUser?.isLocked()).toBe(true);
    expect(dbUser?.lockUntil).toBeDefined();

    // Fast-forward lockUntil into the past
    dbUser!.lockUntil = new Date(Date.now() - 1000);
    await dbUser!.save();

    // Now correct password must succeed and reset failed attempts
    const unlockedRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: VALID_TEST_PASSWORD });

    expect(unlockedRes.status).toBe(HttpStatus.OK);
    expect(unlockedRes.body.success).toBe(true);

    const clearedUser = await User.findById(user.id);
    expect(clearedUser?.failedLoginAttempts).toBe(0);
    expect(clearedUser?.lockUntil).toBeNull();
  });
});
