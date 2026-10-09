export function calculateMarginMultiplier(
  scoreA: number,
  scoreB: number,
  movEnabled: boolean,
  movWeight: number,
): number {
  if (!movEnabled) {
    return 1.0;
  }

  const totalScore = scoreA + scoreB;
  if (totalScore <= 0) {
    return 1.0;
  }

  const normalizedMargin = Math.abs(scoreA - scoreB) / totalScore;
  return 1.0 + movWeight * normalizedMargin;
}
