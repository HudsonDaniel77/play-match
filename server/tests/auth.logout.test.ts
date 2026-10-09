import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { RefreshSession } from '../src/models/refresh-session.model.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('Logout & Logout-All Flows', () => {
  it('POST /api/v1/auth/logout revokes current session only and clears cookie', async () => {
    const { user } = await createTestUser({ email: 'logout.test@example.com' });

    // Session 1 (web)
    const login1Res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'web')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const cookie1 = login1Res.headers['set-cookie'];

    // Session 2 (mobile)
    const login2Res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const mobileToken = login2Res.body.data.refreshToken;

    // Logout session 1 (web)
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie1)
      .send({});

    expect(logoutRes.status).toBe(HttpStatus.OK);
    expect(logoutRes.body.success).toBe(true);

    // Verify cookie is cleared
    const clearedCookies = logoutRes.headers['set-cookie'];
    expect(clearedCookies).toBeDefined();

    // Session 2 (mobile) should still be valid!
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: mobileToken });

    expect(refreshRes.status).toBe(HttpStatus.OK);
    expect(refreshRes.body.success).toBe(true);
  });

  it('POST /api/v1/auth/logout-all revokes all sessions across all devices', async () => {
    const { user } = await createTestUser({ email: 'logoutall.test@example.com' });

    // Login from device 1
    const login1Res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const token1 = login1Res.body.data.refreshToken;
    const accessToken = login1Res.body.data.accessToken;

    // Login from device 2
    const login2Res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const token2 = login2Res.body.data.refreshToken;

    // Call logout-all using Bearer token
    const logoutAllRes = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(logoutAllRes.status).toBe(HttpStatus.OK);
    expect(logoutAllRes.body.success).toBe(true);

    // Verify both sessions are revoked
    const activeSessions = await RefreshSession.find({
      user: user.id,
      revokedAt: null,
    });
    expect(activeSessions.length).toBe(0);

    // Both refresh tokens fail now
    const refresh1 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: token1 });
    expect(refresh1.status).toBe(HttpStatus.UNAUTHORIZED);

    const refresh2 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: token2 });
    expect(refresh2.status).toBe(HttpStatus.UNAUTHORIZED);
  });
});
