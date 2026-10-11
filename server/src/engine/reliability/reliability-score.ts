import { ReliabilityTiers, type ReliabilityTier } from '../../constants/reliability-constants.js';

export interface ReliabilityCounters {
  attendedGames: number;
  onTimeLeaves: number;
  lateLeaves: number;
  noShows: number;
}

export interface ReliabilityScoringConfig {
  /** Virtual perfect games added so a single bad event does not collapse a new player's score. */
  priorGames: number;
  creditOnTimeLeave: number;
  creditLateLeave: number;
  creditNoShow: number;
  /** Players with fewer counted games cannot reach gold or platinum. */
  minGamesForTopTiers: number;
  tierSilverMin: number;
  tierGoldMin: number;
  tierPlatinumMin: number;
}

export interface ReliabilityScoreResult {
  score: number;
  tier: ReliabilityTier;
  gamesCounted: number;
}

/**
 * Pure reliability scoring. Each commitment a player made earns credit in [0, 1]:
 * attended = 1, on-time leave / late leave / no-show use the configured credits.
 * score = round(100 * (earnedCredit + priorGames) / (gamesCounted + priorGames)).
 */
export function computeReliabilityScore(
  counters: ReliabilityCounters,
  cfg: ReliabilityScoringConfig,
): ReliabilityScoreResult {
  const gamesCounted =
    counters.attendedGames + counters.onTimeLeaves + counters.lateLeaves + counters.noShows;

  const earnedCredit =
    counters.attendedGames * 1 +
    counters.onTimeLeaves * cfg.creditOnTimeLeave +
    counters.lateLeaves * cfg.creditLateLeave +
    counters.noShows * cfg.creditNoShow;

  const denominator = gamesCounted + cfg.priorGames;
  const rawScore = denominator === 0 ? 100 : (100 * (earnedCredit + cfg.priorGames)) / denominator;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  return { score, tier: resolveTier(score, gamesCounted, cfg), gamesCounted };
}

export function resolveTier(
  score: number,
  gamesCounted: number,
  cfg: ReliabilityScoringConfig,
): ReliabilityTier {
  let tier: ReliabilityTier = ReliabilityTiers.BRONZE;
  if (score >= cfg.tierPlatinumMin) tier = ReliabilityTiers.PLATINUM;
  else if (score >= cfg.tierGoldMin) tier = ReliabilityTiers.GOLD;
  else if (score >= cfg.tierSilverMin) tier = ReliabilityTiers.SILVER;

  const isTopTier = tier === ReliabilityTiers.GOLD || tier === ReliabilityTiers.PLATINUM;
  if (isTopTier && gamesCounted < cfg.minGamesForTopTiers) {
    return ReliabilityTiers.SILVER;
  }
  return tier;
}
