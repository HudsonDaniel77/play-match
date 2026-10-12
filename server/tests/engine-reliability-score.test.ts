import { describe, it, expect } from 'vitest';
import {
  computeReliabilityScore,
  resolveTier,
  type ReliabilityScoringConfig,
} from '../src/engine/reliability/index.js';
import { ReliabilityTiers } from '../src/constants/reliability-constants.js';

const cfg: ReliabilityScoringConfig = {
  priorGames: 5,
  creditOnTimeLeave: 0.75,
  creditLateLeave: 0.25,
  creditNoShow: 0,
  minGamesForTopTiers: 3,
  tierSilverMin: 70,
  tierGoldMin: 85,
  tierPlatinumMin: 95,
};

const none = { attendedGames: 0, onTimeLeaves: 0, lateLeaves: 0, noShows: 0 };

describe('Reliability score engine (pure)', () => {
  it('gives a brand new player a score of 100 and a capped tier', () => {
    const r = computeReliabilityScore(none, cfg);
    expect(r.score).toBe(100);
    expect(r.gamesCounted).toBe(0);
    // Not enough games for gold/platinum
    expect(r.tier).toBe(ReliabilityTiers.SILVER);
  });

  it('a single no-show does not collapse a new player to zero', () => {
    const r = computeReliabilityScore({ ...none, noShows: 1 }, cfg);
    // 100 * 5 / 6 = 83.33 -> 83
    expect(r.score).toBe(83);
    expect(r.gamesCounted).toBe(1);
  });

  it('weights late leaves worse than on-time leaves', () => {
    const onTime = computeReliabilityScore({ ...none, onTimeLeaves: 1 }, cfg);
    const late = computeReliabilityScore({ ...none, lateLeaves: 1 }, cfg);
    expect(onTime.score).toBeGreaterThan(late.score);
    expect(late.score).toBeGreaterThan(computeReliabilityScore({ ...none, noShows: 1 }, cfg).score);
  });

  it('reaches platinum with enough clean games', () => {
    const r = computeReliabilityScore({ ...none, attendedGames: 10 }, cfg);
    expect(r.score).toBe(100);
    expect(r.tier).toBe(ReliabilityTiers.PLATINUM);
  });

  it('drops to bronze after repeated no-shows', () => {
    const r = computeReliabilityScore({ ...none, attendedGames: 2, noShows: 10 }, cfg);
    expect(r.score).toBeLessThan(cfg.tierSilverMin);
    expect(r.tier).toBe(ReliabilityTiers.BRONZE);
  });

  it('never leaves the 0-100 range', () => {
    const worst = computeReliabilityScore({ ...none, noShows: 1000 }, cfg);
    const best = computeReliabilityScore({ ...none, attendedGames: 1000 }, cfg);
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(best.score).toBeLessThanOrEqual(100);
  });

  it('handles priorGames of 0 without dividing by zero', () => {
    const r = computeReliabilityScore(none, { ...cfg, priorGames: 0 });
    expect(r.score).toBe(100);
  });

  it('resolveTier applies the minimum-games cap only to gold and platinum', () => {
    expect(resolveTier(99, 1, cfg)).toBe(ReliabilityTiers.SILVER);
    expect(resolveTier(99, 3, cfg)).toBe(ReliabilityTiers.PLATINUM);
    expect(resolveTier(88, 3, cfg)).toBe(ReliabilityTiers.GOLD);
    expect(resolveTier(75, 0, cfg)).toBe(ReliabilityTiers.SILVER);
    expect(resolveTier(40, 0, cfg)).toBe(ReliabilityTiers.BRONZE);
  });
});
