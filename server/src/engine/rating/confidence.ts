export function calculateConfidence(
  gamesPlayed: number,
  lastRatedAt: Date | null,
  currentDate: Date,
  gamesThreshold: number,
  recencyHalfLifeDays: number,
): number {
  if (gamesPlayed <= 0 || !lastRatedAt) {
    return 0.0;
  }

  // Volume factor [0, 1]
  const volumeFactor = Math.min(1.0, Math.max(0.0, gamesPlayed / gamesThreshold));

  // Recency decay: e^(-lambda * t) where half-life is recencyHalfLifeDays
  const diffMs = Math.max(0, currentDate.getTime() - lastRatedAt.getTime());
  const daysSince = diffMs / (1000 * 60 * 60 * 24);
  const recencyFactor = Math.pow(0.5, daysSince / recencyHalfLifeDays);

  const rawConfidence = volumeFactor * recencyFactor;
  // Clamp between 0.0 and 1.0, rounded to 2 decimal places
  const clamped = Math.min(1.0, Math.max(0.0, rawConfidence));
  return Math.round(clamped * 100) / 100;
}
