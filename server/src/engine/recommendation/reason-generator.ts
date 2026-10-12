import type { RecommendationEvaluationInput } from './interfaces.js';

export function generateRecommendationReasons(
  input: RecommendationEvaluationInput,
): string[] {
  const reasons: string[] = [];

  // 1. Skill Reason
  if (input.ratingGap !== null) {
    const gap = Math.abs(Math.round(input.ratingGap));
    if (gap <= 50) {
      reasons.push(`Close skill match (within ${gap} Elo points)`);
    } else if (input.ratingInRange) {
      reasons.push('Fits within your target skill rating range');
    }
  }

  // 2. Proximity Reason
  if (input.distanceKm <= 3) {
    reasons.push(`Convenient location (${input.distanceKm} km away)`);
  } else if (input.distanceKm <= input.travelRadiusKm) {
    reasons.push(`Located within your ${input.travelRadiusKm} km travel radius`);
  }

  // 3. Schedule Reason
  if (input.availabilityFit) {
    reasons.push('Matches your recurring weekly availability');
  }

  // 4. Host Reliability Reason
  if (input.hostReliabilityScore !== null && input.hostReliabilityScore >= 85) {
    reasons.push('Organized by a highly rated, reliable host');
  }

  // 5. Open seats reason
  if (input.seatsLeft <= 3 && input.seatsLeft > 0) {
    reasons.push(
      `Only ${input.seatsLeft} ${input.seatsLeft === 1 ? 'spot' : 'spots'} remaining`,
    );
  }

  // Fallback if no specific reasons triggered
  if (reasons.length === 0) {
    reasons.push('Recommended based on overall profile and location fit');
  }

  return reasons;
}
