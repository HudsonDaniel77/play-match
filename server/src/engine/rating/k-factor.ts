import type { RatingEngineConfig } from './interfaces.js';

export interface KFactorResolution {
  kEffective: number;
  kBaseTier: number;
  inactivityMultiplier: number;
}

export function determineKFactor(
  gamesPlayedBefore: number,
  lastRatedAt: Date | null,
  currentDate: Date,
  config: Pick<RatingEngineConfig, 'kTiers' | 'inactivityDays' | 'inactivityKMultiplier'>,
): KFactorResolution {
  // 1. Locate base tier matching gamesPlayedBefore
  let baseK = 32;
  for (const tier of config.kTiers) {
    if (tier.upToGames == null || gamesPlayedBefore < tier.upToGames) {
      baseK = tier.k;
      break;
    }
  }

  // 2. Determine inactivity multiplier
  let inactivityMultiplier = 1.0;
  if (lastRatedAt) {
    const diffMs = currentDate.getTime() - lastRatedAt.getTime();
    const daysSinceLastGame = diffMs / (1000 * 60 * 60 * 24);
    if (daysSinceLastGame > config.inactivityDays) {
      inactivityMultiplier = config.inactivityKMultiplier;
    }
  }

  const kEffective = baseK * inactivityMultiplier;

  return {
    kEffective,
    kBaseTier: baseK,
    inactivityMultiplier,
  };
}
