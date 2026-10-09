import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const booleanStringSchema = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    return val.toLowerCase() === 'true' || val === '1';
  });

const numberStringSchema = z
  .union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === 'number') return val;
    const parsed = Number(val);
    if (isNaN(parsed)) {
      throw new Error(`Expected a valid number, received: ${val}`);
    }
    return parsed;
  });

export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: numberStringSchema.pipe(z.number().int().min(1).max(65535)).default(5000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    API_BASE_PATH: z
      .string()
      .min(1)
      .regex(/^\//, 'API_BASE_PATH must start with /')
      .default('/api/v1'),
    CLIENT_WEB_URL: z.string().url('CLIENT_WEB_URL must be a valid URL'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
    ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
    REFRESH_TOKEN_TTL: z.string().min(1).default('7d'),
    PASSWORD_HASH_COST: numberStringSchema
      .pipe(z.number().int().min(4).max(31))
      .default(12),
    PASSWORD_MIN_LENGTH: numberStringSchema
      .pipe(z.number().int().min(8))
      .default(8),
    PASSWORD_REQUIRE_COMPLEXITY: booleanStringSchema.default(true),
    MAX_FAILED_LOGINS: numberStringSchema
      .pipe(z.number().int().min(1))
      .default(5),
    LOCKOUT_MINUTES: numberStringSchema
      .pipe(z.number().int().min(1))
      .default(15),
    EMAIL_VERIFICATION_REQUIRED: booleanStringSchema.default(true),
    EMAIL_TOKEN_TTL: z.string().min(1).default('24h'),
    PASSWORD_RESET_TOKEN_TTL: z.string().min(1).default('1h'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((val) =>
        val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    COOKIE_DOMAIN: z.string().optional().default('localhost'),
    COOKIE_SECURE: booleanStringSchema.default(false),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    REFRESH_COOKIE_NAME: z.string().min(1).default('playmatch_refresh'),
    RATE_LIMIT_WINDOW_MS: numberStringSchema
      .pipe(z.number().int().min(1000))
      .default(900000),
    RATE_LIMIT_MAX: numberStringSchema
      .pipe(z.number().int().min(1))
      .default(100),
    AUTH_RATE_LIMIT_MAX: numberStringSchema
      .pipe(z.number().int().min(1))
      .default(10),
    SMTP_HOST: z.string().optional().default('smtp.mailtrap.io'),
    SMTP_PORT: numberStringSchema
      .pipe(z.number().int().min(1).max(65535))
      .default(587),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    EMAIL_FROM: z.string().min(1).default('PlayMatch Team <noreply@playmatch.app>'),
    EMAIL_TRANSPORT: z.enum(['smtp', 'console']).default('console'),
    CLIENT_HEADER_NAME: z.string().min(1).default('x-client-type'),

    // Module 2 Profile & Sport Catalog Configs
    DEFAULT_SEED_RATING: numberStringSchema
      .pipe(z.number().int().min(100))
      .default(1200),
    PROVISIONAL_GAMES_THRESHOLD: numberStringSchema
      .pipe(z.number().int().min(1))
      .default(10),
    MAX_SPORTS_PER_PLAYER: numberStringSchema
      .pipe(z.number().int().min(1).max(20))
      .default(5),
    MIN_TRAVEL_RADIUS_KM: numberStringSchema
      .pipe(z.number().min(1))
      .default(1),
    MAX_TRAVEL_RADIUS_KM: numberStringSchema
      .pipe(z.number().min(5))
      .default(100),
    DEFAULT_TRAVEL_RADIUS_KM: numberStringSchema
      .pipe(z.number().min(1))
      .default(15),
    MAX_AVAILABILITY_SLOTS_PER_DAY: numberStringSchema
      .pipe(z.number().int().min(1))
      .default(6),
    MIN_SLOT_DURATION_MINUTES: numberStringSchema
      .pipe(z.number().int().min(15))
      .default(30),
    LOCATION_PUBLIC_PRECISION_DECIMALS: numberStringSchema
      .pipe(z.number().int().min(0).max(6))
      .default(2),
    BIO_MAX_LENGTH: numberStringSchema
      .pipe(z.number().int().min(50))
      .default(500),
    NAME_MIN_LENGTH: numberStringSchema
      .pipe(z.number().int().min(1))
      .default(2),
    NAME_MAX_LENGTH: numberStringSchema
      .pipe(z.number().int().min(10))
      .default(50),
    MIN_AGE: numberStringSchema
      .pipe(z.number().int().min(5))
      .default(13),
    MAX_AGE: numberStringSchema
      .pipe(z.number().int().min(50))
      .default(100),
    SPORTS_SEED_FILE: z.string().min(1).default('./src/data/sports-seed.json'),
    DEFAULT_TIMEZONE: z.string().min(1).default('UTC'),
  })
  .superRefine((data, ctx) => {
    if (data.EMAIL_TRANSPORT === 'smtp') {
      if (!data.SMTP_HOST || data.SMTP_HOST.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_HOST'],
          message: 'SMTP_HOST is required when EMAIL_TRANSPORT is smtp',
        });
      }
    }
    if (data.MIN_TRAVEL_RADIUS_KM > data.MAX_TRAVEL_RADIUS_KM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MIN_TRAVEL_RADIUS_KM'],
        message: 'MIN_TRAVEL_RADIUS_KM must not exceed MAX_TRAVEL_RADIUS_KM',
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function validateConfig(rawEnv: Record<string, unknown>): Config {
  const result = configSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    const failureMessage = `Configuration validation failed at startup:\n${errorDetails}`;
    throw new Error(failureMessage);
  }
  return result.data;
}

// In test environment, provide fallback valid defaults so imported modules don't crash before tests configure them
const defaultTestEnv = {
  NODE_ENV: 'test',
  PORT: '5001',
  LOG_LEVEL: 'silent',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/playmatch-test',
  API_BASE_PATH: '/api/v1',
  CLIENT_WEB_URL: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test_super_secret_access_jwt_key_32_chars_min_length',
  JWT_REFRESH_SECRET: 'test_super_secret_refresh_jwt_key_32_chars_min',
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
  AUTH_RATE_LIMIT_MAX: '50',
  EMAIL_TRANSPORT: 'console',
  EMAIL_FROM: 'noreply@playmatch.app',
  CLIENT_HEADER_NAME: 'x-client-type',

  // Module 2 Test Defaults
  DEFAULT_SEED_RATING: '1200',
  PROVISIONAL_GAMES_THRESHOLD: '10',
  MAX_SPORTS_PER_PLAYER: '5',
  MIN_TRAVEL_RADIUS_KM: '1',
  MAX_TRAVEL_RADIUS_KM: '100',
  DEFAULT_TRAVEL_RADIUS_KM: '15',
  MAX_AVAILABILITY_SLOTS_PER_DAY: '6',
  MIN_SLOT_DURATION_MINUTES: '30',
  LOCATION_PUBLIC_PRECISION_DECIMALS: '2',
  BIO_MAX_LENGTH: '500',
  NAME_MIN_LENGTH: '2',
  NAME_MAX_LENGTH: '50',
  MIN_AGE: '13',
  MAX_AGE: '100',
  SPORTS_SEED_FILE: './src/data/sports-seed.json',
  DEFAULT_TIMEZONE: 'UTC',
};

const rawSourceEnv =
  process.env.NODE_ENV === 'test'
    ? { ...defaultTestEnv, ...process.env }
    : process.env;

export const config: Config = validateConfig(rawSourceEnv);
