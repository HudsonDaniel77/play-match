import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { OneTimeToken } from '../src/models/one-time-token.model.js';
import { TokenTypes } from '../src/constants/token-types.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('Email Verification Flow', () => {
  it('verifies email successfully with valid token', async () => {
    const { user } = await createTestUser({
      email: 'verify.me@example.com',
      isEmailVerified: false,
    });

    const token = await tokenService.createOneTimeToken({
      userId: user.id,
      type: TokenTypes.EMAIL_VERIFICATION,
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);

    const updatedUser = await User.findById(user.id);
    expect(updatedUser?.isEmailVerified).toBe(true);

    // Token should now be consumed
    const tokenDoc = await OneTimeToken.findOne({ user: user.id });
    expect(tokenDoc?.usedAt).toBeDefined();

    // Reusing the same token fails
    const reuseRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token });

    expect(reuseRes.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(reuseRes.body.error.code).toBe(ErrorCodes.AUTH_TOKEN_INVALID);
  });

  it('POST /api/v1/auth/resend-verification issues new token without leaking user existence', async () => {
    const { user } = await createTestUser({
      email: 'resend.test@example.com',
      isEmailVerified: false,
    });

    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: user.email });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);

    // Also returns 200 for non-existent email
    const nonExistentRes = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'nonexistent@example.com' });

    expect(nonExistentRes.status).toBe(HttpStatus.OK);
    expect(nonExistentRes.body.success).toBe(true);
  });
});
