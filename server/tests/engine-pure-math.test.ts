import { describe, it, expect } from 'vitest';
import {
  calculateExpectedScore,
  calculatePlayerDelta,
  clampAndRoundRating,
  determineKFactor,
  calculateMarginMultiplier,
  calculateConfidence,
  resolveBandLabel,
  calculateMatchRatings,
  type RatingEngineConfig,
  type SkillBandDefinition,
} from '../src/engine/rating/index.js';
import { validateConfig } from '../src/config/index.js';

describe('Pure Rating Engine Mathematical Tests', () => {
  const baseConfig: RatingEngineConfig = {
    scaleDivisor: 400,
    kTiers: [
      { upToGames: 10, k: 40 },
      { upToGames: 30, k: 32 },
      { upToGames: null, k: 24 },
    ],
    movEnabled: true,
    movWeight: 0.5,
    ratingMin: 100,
    ratingMax: 3000,
    ratingDecimals: 1,
    inactivityDays: 30,
    inactivityKMultiplier: 1.5,
    confidenceGamesThreshold: 30,
    confidenceRecencyHalfLifeDays: 60,
  };

  const sampleBands: SkillBandDefinition[] = [
    { key: 'beginner', label: 'Beginner', order: 1, seedRating: 1000 },
    { key: 'intermediate', label: 'Intermediate', order: 2, seedRating: 1200 },
    { key: 'advanced', label: 'Advanced', order: 3, seedRating: 1400 },
  ];

  it('worked example 1: 1000 player beats 1100 opponent (K=32, no MOV, D=400) -> expected ~0.360, delta ~+20.5', () => {
    const expected = calculateExpectedScore(1000, 1100, 400);
    // E = 1 / (1 + 10^((1100-1000)/400)) = 1 / (1 + 10^0.25) ≈ 0.359935
    expect(expected).toBeCloseTo(0.36, 2);

    const delta = calculatePlayerDelta(32, 1.0, 1.0, expected);
    // delta = 32 * 1.0 * (1 - 0.359935) ≈ +20.482
    const rounded = clampAndRoundRating(delta, -3000, 3000, 1);
    expect(rounded).toBe(20.5);
  });

  it('worked example 2: 1000 player loses to 900 opponent (K=32, no MOV, D=400) -> expected ~0.640, delta ~-20.5', () => {
    const expected = calculateExpectedScore(1000, 900, 400);
    // E = 1 / (1 + 10^((900-1000)/400)) = 1 / (1 + 10^-0.25) ≈ 0.640065
    expect(expected).toBeCloseTo(0.64, 2);

    const delta = calculatePlayerDelta(32, 1.0, 0.0, expected);
    // delta = 32 * 1.0 * (0 - 0.640065) ≈ -20.482
    const rounded = clampAndRoundRating(delta, -3000, 3000, 1);
    expect(rounded).toBe(-20.5);
  });

  it('calculates draw outcome (S = 0.5) correctly', () => {
    // Equal 1200 players draw -> expected 0.5, delta 0
    const expected = calculateExpectedScore(1200, 1200, 400);
    expect(expected).toBe(0.5);

    const delta = calculatePlayerDelta(32, 1.0, 0.5, expected);
    expect(delta).toBe(0);

    // 1000 draws with 1200 opponent -> expected ~0.24, positive gain for lower rated
    const expUnderdog = calculateExpectedScore(1000, 1200, 400);
    const deltaUnderdog = calculatePlayerDelta(32, 1.0, 0.5, expUnderdog);
    expect(deltaUnderdog).toBeGreaterThan(0);
  });

  it('determines K-factor tiers accurately across boundary edges', () => {
    const now = new Date();
    // 9 games -> tier 1 (<10) -> K40
    const k9 = determineKFactor(9, now, now, baseConfig);
    expect(k9.kBaseTier).toBe(40);
    expect(k9.kEffective).toBe(40);

    // 10 games -> tier 2 (>=10, <30) -> K32
    const k10 = determineKFactor(10, now, now, baseConfig);
    expect(k10.kBaseTier).toBe(32);
    expect(k10.kEffective).toBe(32);

    // 29 games -> tier 2 -> K32
    const k29 = determineKFactor(29, now, now, baseConfig);
    expect(k29.kBaseTier).toBe(32);

    // 30 games -> tier 3 (>=30) -> K24
    const k30 = determineKFactor(30, now, now, baseConfig);
    expect(k30.kBaseTier).toBe(24);

    // 50 games -> tier 3 -> K24
    const k50 = determineKFactor(50, now, now, baseConfig);
    expect(k50.kBaseTier).toBe(24);
  });

  it('applies inactivity multiplier when days since last game exceeds INACTIVITY_DAYS', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    // 20 days ago -> no inactivity boost
    const recent = new Date('2026-09-20T12:00:00Z');
    const resRecent = determineKFactor(35, recent, now, baseConfig);
    expect(resRecent.inactivityMultiplier).toBe(1.0);
    expect(resRecent.kEffective).toBe(24);

    // 45 days ago -> 1.5x inactivity multiplier applied
    const inactive = new Date('2026-08-26T12:00:00Z');
    const resInactive = determineKFactor(35, inactive, now, baseConfig);
    expect(resInactive.inactivityMultiplier).toBe(1.5);
    expect(resInactive.kEffective).toBe(24 * 1.5); // 36
  });

  it('calculates Margin of Victory (MOV) correctly with division-by-zero protection', () => {
    // 0-0 scoreline protection
    const movZero = calculateMarginMultiplier(0, 0, true, 0.5);
    expect(movZero).toBe(1.0);

    // MOV disabled
    const movDisabled = calculateMarginMultiplier(21, 5, false, 0.5);
    expect(movDisabled).toBe(1.0);

    // 21-7 -> normalized margin = (21-7)/(21+7) = 14/28 = 0.5
    // MOV = 1 + 0.5 * 0.5 = 1.25
    const mov21_7 = calculateMarginMultiplier(21, 7, true, 0.5);
    expect(mov21_7).toBeCloseTo(1.25, 4);
  });

  it('clamps ratings between RATING_MIN and RATING_MAX and rounds to specified decimals', () => {
    // Normal round
    expect(clampAndRoundRating(1234.567, 100, 3000, 1)).toBe(1234.6);
    expect(clampAndRoundRating(1234.567, 100, 3000, 2)).toBe(1234.57);

    // Floor clamping
    expect(clampAndRoundRating(50, 100, 3000, 1)).toBe(100);

    // Ceiling clamping
    expect(clampAndRoundRating(3500, 100, 3000, 1)).toBe(3000);
  });

  it('maps ratings to skill band labels using midpoints between seed ratings', () => {
    // Beginner (1000), Intermediate (1200), Advanced (1400)
    // Midpoints: 1100 and 1300
    expect(resolveBandLabel(900, sampleBands).key).toBe('beginner');
    expect(resolveBandLabel(1099, sampleBands).key).toBe('beginner');
    expect(resolveBandLabel(1100, sampleBands).key).toBe('intermediate');
    expect(resolveBandLabel(1250, sampleBands).key).toBe('intermediate');
    expect(resolveBandLabel(1299, sampleBands).key).toBe('intermediate');
    expect(resolveBandLabel(1300, sampleBands).key).toBe('advanced');
    expect(resolveBandLabel(1800, sampleBands).key).toBe('advanced');
  });

  it('computes confidence strictly within [0, 1] based on volume and recency', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    // 0 games -> confidence 0
    expect(calculateConfidence(0, null, now, 30, 60)).toBe(0.0);

    // 15 games, played today -> volume = 0.5, recency = 1.0 -> 0.50
    expect(calculateConfidence(15, now, now, 30, 60)).toBe(0.5);

    // 30 games, played today -> volume = 1.0, recency = 1.0 -> 1.00
    expect(calculateConfidence(30, now, now, 30, 60)).toBe(1.0);

    // 30 games, played 60 days ago (1 half-life) -> 1.0 * 0.5 = 0.50
    const halfLifeAgo = new Date('2026-08-11T12:00:00Z');
    expect(calculateConfidence(30, halfLifeAgo, now, 30, 60)).toBe(0.5);

    // 100 games, played today -> clamped to 1.0
    expect(calculateConfidence(100, now, now, 30, 60)).toBe(1.0);
  });

  it('calculates full match deltas for teams with mixed ratings', () => {
    const sideA = {
      sideKey: 'side_a',
      score: 21,
      players: [
        { userId: 'player-1', rating: 1400, gamesPlayed: 25, lastRatedAt: new Date() },
        { userId: 'player-2', rating: 1000, gamesPlayed: 25, lastRatedAt: new Date() },
      ],
    };
    const sideB = {
      sideKey: 'side_b',
      score: 15,
      players: [
        { userId: 'player-3', rating: 1200, gamesPlayed: 25, lastRatedAt: new Date() },
        { userId: 'player-4', rating: 1200, gamesPlayed: 25, lastRatedAt: new Date() },
      ],
    };

    const results = calculateMatchRatings(sideA, sideB, baseConfig, sampleBands);
    expect(results.length).toBe(4);

    const p1 = results.find((r) => r.userId === 'player-1')!;
    const p2 = results.find((r) => r.userId === 'player-2')!;

    // Team A won. Both have same K-factor (32).
    // But p2 (rating 1000) was an underdog against Team B (team rating 1200),
    // while p1 (rating 1400) was favored against Team B.
    // Therefore, the weaker player p2 gains MORE points for the victory than p1!
    expect(p2.delta).toBeGreaterThan(p1.delta);
  });

  it('rejects malformed K-tiers configuration during startup validation', () => {
    const validEnv = {
      NODE_ENV: 'test',
      PORT: '5000',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      CLIENT_WEB_URL: 'http://localhost:3000',
      JWT_ACCESS_SECRET: 'super_secret_access_token_key_at_least_32_characters_long',
      JWT_REFRESH_SECRET: 'super_secret_refresh_token_key_at_least_32_characters_long',
    };

    // Unsorted K-tiers (10 then 5)
    expect(() =>
      validateConfig({
        ...validEnv,
        RATING_K_TIERS: '[{"upToGames":10,"k":40},{"upToGames":5,"k":32},{"upToGames":null,"k":24}]',
      }),
    ).toThrowError(/RATING_K_TIERS must be strictly sorted/);

    // Final tier not open-ended
    expect(() =>
      validateConfig({
        ...validEnv,
        RATING_K_TIERS: '[{"upToGames":10,"k":40},{"upToGames":30,"k":24}]',
      }),
    ).toThrowError(/The final K-tier must be open-ended/);

    // Invalid JSON
    expect(() =>
      validateConfig({
        ...validEnv,
        RATING_K_TIERS: 'not-json',
      }),
    ).toThrowError(/RATING_K_TIERS must be valid JSON/);
  });
});
