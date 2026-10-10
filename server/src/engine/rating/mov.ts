export function calculateMarginMultiplier(
  scoreA: number,
  scoreB: number,
  movEnabled: boolean,
  movWeight: number,
  scoringType?: string,
): number {
  if (!movEnabled) {
    return 1.0;
  }

  const diff = Math.abs(scoreA - scoreB);
  if (diff === 0) {
    return 1.0;
  }

  // Scoring-type specific normalization
  let normalizedMargin: number;

  if (scoringType === 'sets') {
    // In set-based games (e.g. best-of-3 or best-of-5), margin is difference in sets won divided by total sets played
    const totalSets = scoreA + scoreB;
    normalizedMargin = totalSets > 0 ? diff / totalSets : 0;
  } else {
    // Standard normalized margin for continuous points, runs, or goals
    const totalScore = scoreA + scoreB;
    normalizedMargin = totalScore > 0 ? diff / totalScore : 0;
  }

  return 1.0 + movWeight * normalizedMargin;
}
