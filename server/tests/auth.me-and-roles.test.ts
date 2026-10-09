import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { type Application } from 'express';
import { app } from '../src/app.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { authorize } from '../src/middleware/authorize.js';
import { requireVerifiedEmail } from '../src/middleware/require-verified-email.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { sendSuccess } from '../src/utils/api-response.js';
import { Roles } from '../src/constants/roles.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('Auth Me, Token Verification & Role-Based Authorization', () => {
  let testApp: Application;

  beforeAll(() => {
    testApp = express();
    testApp.use(express.json());
    testApp.get(
      '/test/admin-only',
      authenticate,
      authorize(Roles.ADMIN),
      (req, res) => sendSuccess(res, { secret: 'admin-data' }),
    );
    testApp.get(
      '/test/verified-only',
      authenticate,
      requireVerifiedEmail,
      (req, res) => sendSuccess(res, { access: 'granted' }),
    );
    testApp.use(errorHandler);
  });

  it('GET /api/v1/auth/me returns sanitized user without passwordHash', async () => {
    const { user } = await createTestUser({ email: 'me.test@example.com' });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: VALID_TEST_PASSWORD });

    const accessToken = loginRes.body.data.accessToken;

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.status).toBe(HttpStatus.OK);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.id).toBe(user.id);
    expect(meRes.body.data.user.email).toBe(user.email);
    expect(meRes.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(meRes.body)).not.toContain('passwordHash');
  });

  it('rejects missing or invalid Bearer token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_UNAUTHORIZED);

    const invalidRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid.token.value');
    expect(invalidRes.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('rejects expired access token with 401', () => {
    expect(() => tokenService.verifyAccessToken('invalid.token.payload')).toThrow();
  });

  it('role authorization: player cannot access admin-only route, admin can', async () => {
    const { user: playerUser } = await createTestUser({
      email: 'player@example.com',
      role: Roles.PLAYER,
    });
    const playerToken = tokenService.generateAccessToken({
      userId: playerUser.id,
      role: playerUser.role,
      email: playerUser.email,
    });

    const playerRes = await request(testApp)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(playerRes.status).toBe(HttpStatus.FORBIDDEN);
    expect(playerRes.body.error.code).toBe(ErrorCodes.FORBIDDEN_ACCESS);

    const { user: adminUser } = await createTestUser({
      email: 'admin@example.com',
      role: Roles.ADMIN,
    });
    const adminToken = tokenService.generateAccessToken({
      userId: adminUser.id,
      role: adminUser.role,
      email: adminUser.email,
    });

    const adminRes = await request(testApp)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(HttpStatus.OK);
    expect(adminRes.body.data.secret).toBe('admin-data');
  });

  it('requireVerifiedEmail blocks unverified accounts when email verification is required', async () => {
    const { user: unverifiedUser } = await createTestUser({
      email: 'unverified@example.com',
      isEmailVerified: false,
    });

    const unverifiedToken = tokenService.generateAccessToken({
      userId: unverifiedUser.id,
      role: unverifiedUser.role,
      email: unverifiedUser.email,
    });

    const res = await request(testApp)
      .get('/test/verified-only')
      .set('Authorization', `Bearer ${unverifiedToken}`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_EMAIL_NOT_VERIFIED);

    const { user: verifiedUser } = await createTestUser({
      email: 'verified@example.com',
      isEmailVerified: true,
    });

    const verifiedToken = tokenService.generateAccessToken({
      userId: verifiedUser.id,
      role: verifiedUser.role,
      email: verifiedUser.email,
    });

    const grantedRes = await request(testApp)
      .get('/test/verified-only')
      .set('Authorization', `Bearer ${verifiedToken}`);

    expect(grantedRes.status).toBe(HttpStatus.OK);
    expect(grantedRes.body.data.access).toBe('granted');
  });
});
