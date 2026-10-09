import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/config/index.js';

describe('Configuration Module', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    PORT: '5000',
    LOG_LEVEL: 'info',
    MONGODB_URI: 'mongodb://localhost:27017/playmatch-test',
    API_BASE_PATH: '/api/v1',
    CLIENT_WEB_URL: 'http://localhost:3000',
    JWT_ACCESS_SECRET: 'super_secret_access_token_key_at_least_32_characters_long',
    JWT_REFRESH_SECRET: 'super_secret_refresh_token_key_at_least_32_characters_long',
    ACCESS_TOKEN_TTL: '15m',
    REFRESH_TOKEN_TTL: '7d',
    PASSWORD_HASH_COST: '10',
    PASSWORD_MIN_LENGTH: '8',
    PASSWORD_REQUIRE_COMPLEXITY: 'true',
    MAX_FAILED_LOGINS: '5',
    LOCKOUT_MINUTES: '15',
    EMAIL_VERIFICATION_REQUIRED: 'true',
    EMAIL_TOKEN_TTL: '24h',
    PASSWORD_RESET_TOKEN_TTL: '1h',
    CORS_ORIGINS: 'http://localhost:3000',
    COOKIE_DOMAIN: 'localhost',
    COOKIE_SECURE: 'false',
    COOKIE_SAMESITE: 'lax',
    REFRESH_COOKIE_NAME: 'playmatch_refresh',
    RATE_LIMIT_WINDOW_MS: '900000',
    RATE_LIMIT_MAX: '100',
    AUTH_RATE_LIMIT_MAX: '10',
    EMAIL_TRANSPORT: 'console',
    EMAIL_FROM: 'noreply@playmatch.app',
    CLIENT_HEADER_NAME: 'x-client-type',
  };

  it('validates and returns parsed config with valid environment variables', () => {
    const config = validateConfig(validBaseEnv);
    expect(config.PORT).toBe(5000);
    expect(config.PASSWORD_HASH_COST).toBe(10);
    expect(config.PASSWORD_REQUIRE_COMPLEXITY).toBe(true);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('fails fast when MONGODB_URI is missing', () => {
    const invalidEnv = { ...validBaseEnv, MONGODB_URI: '' };
    expect(() => validateConfig(invalidEnv)).toThrowError(
      /Configuration validation failed at startup/,
    );
  });

  it('fails fast when JWT_ACCESS_SECRET is shorter than 32 characters', () => {
    const invalidEnv = { ...validBaseEnv, JWT_ACCESS_SECRET: 'too_short_secret' };
    expect(() => validateConfig(invalidEnv)).toThrowError(
      /JWT_ACCESS_SECRET must be at least 32 characters long/,
    );
  });

  it('fails fast when JWT_REFRESH_SECRET is shorter than 32 characters', () => {
    const invalidEnv = { ...validBaseEnv, JWT_REFRESH_SECRET: 'short_refresh_secret' };
    expect(() => validateConfig(invalidEnv)).toThrowError(
      /JWT_REFRESH_SECRET must be at least 32 characters long/,
    );
  });

  it('fails fast when CLIENT_WEB_URL is not a valid URL', () => {
    const invalidEnv = { ...validBaseEnv, CLIENT_WEB_URL: 'invalid-url-string' };
    expect(() => validateConfig(invalidEnv)).toThrowError(
      /CLIENT_WEB_URL must be a valid URL/,
    );
  });

  it('fails fast when EMAIL_TRANSPORT is smtp but SMTP_HOST is missing', () => {
    const invalidEnv = {
      ...validBaseEnv,
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: '',
    };
    expect(() => validateConfig(invalidEnv)).toThrowError(
      /SMTP_HOST is required when EMAIL_TRANSPORT is smtp/,
    );
  });
});
