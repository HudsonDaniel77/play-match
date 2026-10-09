import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { TokenTypes } from '../src/constants/token-types.js';
import { OneTimeToken } from '../src/models/one-time-token.model.js';
import { VALID_TEST_PASSWORD, WEAK_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('POST /api/v1/auth/register', () => {
  it('registers a user successfully as web client (sets cookie, omits refreshToken from body)', async () => {
    const payload = {
      email: 'alex.morgan@example.com',
      password: VALID_TEST_PASSWORD,
      name: 'Alex Morgan',
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('x-client-type', 'web')
      .send(payload);

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe('alex.morgan@example.com');
    expect(res.body.data.user.name).toBe('Alex Morgan');
    expect(res.body.data.user.role).toBe('player');
    expect(res.body.data.user.isEmailVerified).toBe(false);
    expect(res.body.data.accessToken).toBeDefined();
    // Web clients should NOT receive refreshToken in body
    expect(res.body.data.refreshToken).toBeUndefined();

    // Security check: passwordHash must NEVER be returned
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    // Cookie check
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('playmatch_refresh=');
    expect(cookies[0]).toContain('HttpOnly');

    // Verification token created in database
    const tokenRecord = await OneTimeToken.findOne({
      type: TokenTypes.EMAIL_VERIFICATION,
    });
    expect(tokenRecord).toBeDefined();
  });

  it('registers a user successfully as mobile client (returns refreshToken in JSON body)', async () => {
    const payload = {
      email: 'mobile.user@example.com',
      password: VALID_TEST_PASSWORD,
      name: 'Mobile Player',
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('x-client-type', 'mobile')
      .send(payload);

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data.refreshToken).toBeDefined();
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  it('rejects duplicate email with 409 Conflict', async () => {
    const payload = {
      email: 'duplicate@example.com',
      password: VALID_TEST_PASSWORD,
      name: 'First User',
    };

    const firstRes = await request(app)
      .post('/api/v1/auth/register')
      .send(payload);
    expect(firstRes.status).toBe(HttpStatus.CREATED);

    const dupRes = await request(app)
      .post('/api/v1/auth/register')
      .send(payload);

    expect(dupRes.status).toBe(HttpStatus.CONFLICT);
    expect(dupRes.body.success).toBe(false);
    expect(dupRes.body.error.code).toBe(ErrorCodes.USER_ALREADY_EXISTS);
  });

  it('rejects weak password with 400 Validation Error', async () => {
    const payload = {
      email: 'weakpass@example.com',
      password: WEAK_TEST_PASSWORD,
      name: 'Weak Pass User',
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(payload);

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });
});
