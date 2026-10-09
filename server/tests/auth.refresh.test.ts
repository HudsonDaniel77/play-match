import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { RefreshSession } from '../src/models/refresh-session.model.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { Messages } from '../src/constants/messages.js';
import { UserStatuses } from '../src/constants/user-status.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('POST /api/v1/auth/refresh (Rotation & Reuse Detection)', () => {
  it('rotates refresh token and returns new tokens (mobile)', async () => {
    const { user } = await createTestUser({ email: 'refresh.mobile@example.com' });

    // Initial login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({
        email: user.email,
        password: VALID_TEST_PASSWORD,
      });

    const initialRefreshToken = loginRes.body.data.refreshToken;
    expect(initialRefreshToken).toBeDefined();

    // First refresh: succeeds and rotates
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: initialRefreshToken });

    expect(refreshRes.status).toBe(HttpStatus.OK);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    const rotatedRefreshToken = refreshRes.body.data.refreshToken;
    expect(rotatedRefreshToken).toBeDefined();
    expect(rotatedRefreshToken).not.toBe(initialRefreshToken);

    // Old session should be marked replaced and revoked
    const sessions = await RefreshSession.find({ user: user.id });
    expect(sessions.length).toBe(2);
  });

  it('detects refresh token reuse and revokes entire family', async () => {
    const { user } = await createTestUser({ email: 'reuse.test@example.com' });

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({
        email: user.email,
        password: VALID_TEST_PASSWORD,
      });

    const token1 = loginRes.body.data.refreshToken;

    // First legitimate rotation
    const rotateRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: token1 });

    expect(rotateRes.status).toBe(HttpStatus.OK);
    const token2 = rotateRes.body.data.refreshToken;

    // Attacker tries to reuse token1!
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: token1 });

    expect(reuseRes.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(reuseRes.body.error.code).toBe(ErrorCodes.AUTH_TOKEN_REUSE_DETECTED);
    expect(reuseRes.body.error.message).toBe(Messages.AUTH_TOKEN_REUSE_DETECTED);

    // Because reuse was detected, token2 must now ALSO be revoked!
    const secondTryRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: token2 });

    expect(secondTryRes.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(secondTryRes.body.error.code).toBe(ErrorCodes.AUTH_TOKEN_REUSE_DETECTED);
  });

  it('rotates refresh token via httpOnly cookie (web)', async () => {
    const { user } = await createTestUser({ email: 'refresh.web@example.com' });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'web')
      .send({
        email: user.email,
        password: VALID_TEST_PASSWORD,
      });

    const cookie = loginRes.headers['set-cookie'];

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'web')
      .set('Cookie', cookie)
      .send({});

    expect(refreshRes.status).toBe(HttpStatus.OK);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).toBeUndefined();

    const newCookie = refreshRes.headers['set-cookie'];
    expect(newCookie).toBeDefined();
    expect(newCookie[0]).toContain('playmatch_refresh=');
  });

  it('rejects refresh for suspended user', async () => {
    const { user } = await createTestUser({
      email: 'refresh.suspended@example.com',
      status: UserStatuses.ACTIVE,
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({
        email: user.email,
        password: VALID_TEST_PASSWORD,
      });

    const refreshToken = loginRes.body.data.refreshToken;

    // Suspend user
    user.status = UserStatuses.SUSPENDED;
    await user.save();

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(HttpStatus.FORBIDDEN);
    expect(refreshRes.body.error.code).toBe(ErrorCodes.AUTH_ACCOUNT_SUSPENDED);
  });
});
