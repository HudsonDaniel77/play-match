import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { RefreshSession } from '../src/models/refresh-session.model.js';
import { TokenTypes } from '../src/constants/token-types.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('Password Reset Flow', () => {
  it('forgot-password always responds with generic success message', async () => {
    const { user } = await createTestUser({ email: 'forgot.test@example.com' });

    // Existing user
    const res1 = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });

    expect(res1.status).toBe(HttpStatus.OK);
    expect(res1.body.success).toBe(true);

    // Non-existing user returns identical message
    const res2 = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent-user@example.com' });

    expect(res2.status).toBe(HttpStatus.OK);
    expect(res2.body.success).toBe(true);
    expect(res2.body.message).toBe(res1.body.message);
  });

  it('resets password with valid token and revokes all active refresh sessions', async () => {
    const { user } = await createTestUser({ email: 'reset.me@example.com' });

    // Create an active login session first
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const activeRefreshToken = loginRes.body.data.refreshToken;

    // Generate password reset token
    const resetToken = await tokenService.createOneTimeToken({
      userId: user.id,
      type: TokenTypes.PASSWORD_RESET,
    });

    const newPassword = 'NewSecretPassword2026!Secure';

    // Reset password
    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: resetToken,
        newPassword,
      });

    expect(resetRes.status).toBe(HttpStatus.OK);
    expect(resetRes.body.success).toBe(true);

    // Prior refresh session must be revoked
    const activeSessions = await RefreshSession.find({
      user: user.id,
      revokedAt: null,
    });
    expect(activeSessions.length).toBe(0);

    // Refresh token should now fail
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: activeRefreshToken });

    expect(refreshRes.status).toBe(HttpStatus.UNAUTHORIZED);

    // Old password fails to log in
    const oldLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    expect(oldLoginRes.status).toBe(HttpStatus.UNAUTHORIZED);

    // New password succeeds
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword });

    expect(newLoginRes.status).toBe(HttpStatus.OK);
    expect(newLoginRes.body.success).toBe(true);

    // Reusing the reset token fails
    const reusedTokenRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: resetToken,
        newPassword: 'AnotherPassword2026!Secure',
      });

    expect(reusedTokenRes.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(reusedTokenRes.body.error.code).toBe(ErrorCodes.AUTH_TOKEN_INVALID);
  });
});
