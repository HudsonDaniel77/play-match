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

    // Module 3: Rating Engine Configs
    RATING_SCALE_DIVISOR: numberStringSchema
      .pipe(z.number().positive())
      .default(400),
    RATING_K_TIERS: z
      .union([
        z.array(
          z.object({
            upToGames: z.number().int().positive().nullable().optional(),
            k: z.number().positive(),
          }),
        ),
        z.string(),
      ])
      .default(
        '[{"upToGames":10,"k":40},{"upToGames":30,"k":32},{"upToGames":null,"k":24}]',
      )
      .transform((val, ctx) => {
        let parsed: unknown;
        if (typeof val === 'string') {
          try {
            parsed = JSON.parse(val);
          } catch {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'RATING_K_TIERS must be valid JSON',
            });
            return z.NEVER;
          }
        } else {
          parsed = val;
        }

        const tierSchema = z.array(
          z.object({
            upToGames: z.number().int().positive().nullable().optional(),
            k: z.number().positive(),
          }),
        );

        const res = tierSchema.safeParse(parsed);
        if (!res.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'RATING_K_TIERS must be an array of tiers with positive k',
          });
          return z.NEVER;
        }
        return res.data;
      }),
    MOV_ENABLED: booleanStringSchema.default(true),
    MOV_WEIGHT: numberStringSchema
      .pipe(z.number().min(0).max(5))
      .default(0.5),
    RATING_MIN: numberStringSchema
      .pipe(z.number().min(0))
      .default(100),
    RATING_MAX: numberStringSchema
      .pipe(z.number().min(500))
      .default(3000),
    RATING_DECIMALS: numberStringSchema
      .pipe(z.number().int().min(0).max(4))
      .default(1),
    TEAM_RATING_AGGREGATION: z.enum(['mean']).default('mean'),
    INACTIVITY_DAYS: numberStringSchema
      .pipe(z.number().int().positive())
      .default(30),
    INACTIVITY_K_MULTIPLIER: numberStringSchema
      .pipe(z.number().min(1))
      .default(1.5),
    CONFIDENCE_GAMES_THRESHOLD: numberStringSchema
      .pipe(z.number().int().positive())
      .default(30),
    CONFIDENCE_RECENCY_HALF_LIFE_DAYS: numberStringSchema
      .pipe(z.number().int().positive())
      .default(60),
    LEADERBOARD_PAGE_SIZE_DEFAULT: numberStringSchema
      .pipe(z.number().int().positive())
      .default(20),
    LEADERBOARD_PAGE_SIZE_MAX: numberStringSchema
      .pipe(z.number().int().positive())
      .default(100),
    LEADERBOARD_EXCLUDE_PROVISIONAL: booleanStringSchema.default(true),
    HISTORY_PAGE_SIZE_DEFAULT: numberStringSchema
      .pipe(z.number().int().positive())
      .default(20),
    HISTORY_PAGE_SIZE_MAX: numberStringSchema
      .pipe(z.number().int().positive())
      .default(100),
    MAX_PLAYERS_PER_SIDE_FALLBACK: numberStringSchema
      .pipe(z.number().int().positive())
      .default(11),
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
    if (data.RATING_MIN >= data.RATING_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RATING_MIN'],
        message: 'RATING_MIN must be strictly less than RATING_MAX',
      });
    }
    if (Array.isArray(data.RATING_K_TIERS) && data.RATING_K_TIERS.length > 0) {
      const tiers = data.RATING_K_TIERS;
      // Last tier must be open-ended (upToGames == null)
      const lastTier = tiers[tiers.length - 1];
      if (lastTier && lastTier.upToGames != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RATING_K_TIERS'],
          message: 'The final K-tier must be open-ended (upToGames must be null or omitted)',
        });
      }
      // Check that preceding tiers have upToGames and are strictly ascending
      for (let i = 0; i < tiers.length - 1; i++) {
        const current = tiers[i];
        const next = tiers[i + 1];
        if (current && current.upToGames == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['RATING_K_TIERS'],
            message: `K-tier at index ${i} must define upToGames before the final tier`,
          });
        }
        if (
          current &&
          next &&
          next.upToGames != null &&
          current.upToGames != null &&
          current.upToGames >= next.upToGames
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['RATING_K_TIERS'],
            message: 'RATING_K_TIERS must be strictly sorted by upToGames in ascending order',
          });
        }
      }
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
