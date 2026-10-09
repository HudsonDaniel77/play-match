export function calculateExpectedScore(
  selfRating: number,
  opponentRating: number,
  scaleDivisor: number,
): number {
  const exponent = (opponentRating - selfRating) / scaleDivisor;
  return 1 / (1 + Math.pow(10, exponent));
}

export function calculatePlayerDelta(
  kEffective: number,
  movMultiplier: number,
  outcomeScore: number,
  expectedScore: number,
): number {
  return kEffective * movMultiplier * (outcomeScore - expectedScore);
}

export function clampAndRoundRating(
  unroundedRating: number,
  minRating: number,
  maxRating: number,
  decimals: number,
): number {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(unroundedRating * factor) / factor;
  return Math.min(maxRating, Math.max(minRating, rounded));
}
