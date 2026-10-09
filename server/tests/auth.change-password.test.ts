import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { RefreshSession } from '../src/models/refresh-session.model.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('POST /api/v1/auth/change-password', () => {
  it('changes password successfully and revokes all refresh sessions', async () => {
    const { user } = await createTestUser({ email: 'changepass@example.com' });

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const accessToken = loginRes.body.data.accessToken;
    const refreshToken = loginRes.body.data.refreshToken;

    const newPassword = 'BrandNewPassword2026!Secure';

    // Change password
    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: VALID_TEST_PASSWORD,
        newPassword,
      });

    expect(changeRes.status).toBe(HttpStatus.OK);
    expect(changeRes.body.success).toBe(true);

    // Refresh sessions revoked
    const activeSessions = await RefreshSession.find({
      user: user.id,
      revokedAt: null,
    });
    expect(activeSessions.length).toBe(0);

    // Refresh token should fail
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(HttpStatus.UNAUTHORIZED);

    // Old password fails
    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });
    expect(oldLogin.status).toBe(HttpStatus.UNAUTHORIZED);

    // New password succeeds
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(newLogin.status).toBe(HttpStatus.OK);
  });

  it('rejects change password when current password is wrong', async () => {
    const { user } = await createTestUser({ email: 'wrongcurrent@example.com' });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const accessToken = loginRes.body.data.accessToken;

    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'IncorrectOldPassword123!',
        newPassword: 'BrandNewPassword2026!Secure',
      });

    expect(changeRes.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(changeRes.body.error.code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
  });
});
