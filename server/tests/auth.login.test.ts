import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import { Messages } from '../src/constants/messages.js';
import { UserStatuses } from '../src/constants/user-status.js';
import { createTestUser, VALID_TEST_PASSWORD } from './fixtures/user.fixture.js';

describe('POST /api/v1/auth/login', () => {
  it('logs in successfully as web client (sets cookie and returns access token)', async () => {
    const { user } = await createTestUser({ email: 'login.web@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'web')
      .send({
        email: 'login.web@example.com',
        password: VALID_TEST_PASSWORD,
      });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeUndefined();

    // Security check
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    // Cookie check
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('playmatch_refresh=');
  });

  it('logs in successfully as mobile client (returns refreshToken in body)', async () => {
    await createTestUser({ email: 'login.mobile@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({
        email: 'login.mobile@example.com',
        password: VALID_TEST_PASSWORD,
      });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.refreshToken).toBeDefined();
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  it('returns generic error when email does not exist (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: VALID_TEST_PASSWORD,
      });

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
    expect(res.body.error.message).toBe(Messages.AUTH_GENERIC_INVALID_CREDENTIALS);
  });

  it('returns exact same generic error when password is wrong', async () => {
    await createTestUser({ email: 'wrongpass@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'wrongpass@example.com',
        password: 'IncorrectPassword123!',
      });

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
    expect(res.body.error.message).toBe(Messages.AUTH_GENERIC_INVALID_CREDENTIALS);
  });

  it('rejects suspended users with 403 Forbidden', async () => {
    await createTestUser({
      email: 'suspended@example.com',
      status: UserStatuses.SUSPENDED,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'suspended@example.com',
        password: VALID_TEST_PASSWORD,
      });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.AUTH_ACCOUNT_SUSPENDED);
  });
});
