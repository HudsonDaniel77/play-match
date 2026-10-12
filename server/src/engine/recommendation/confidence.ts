import {
  RecommendationConfidenceLevels,
  type RecommendationConfidenceLevel,
  RECOMMENDATION_LIMITS,
} from '../../constants/recommendation-constants.js';
import type { RecommendationEvaluationInput } from './interfaces.js';

export function evaluateConfidence(
  input: RecommendationEvaluationInput,
): RecommendationConfidenceLevel {
  const isEstablishedPlayer =
    input.playerGamesPlayed >= RECOMMENDATION_LIMITS.PROVISIONAL_GAMES_THRESHOLD;
  const hasRatingData = input.ratingGap !== null;
  const isWithinTravelRadius = input.distanceKm <= input.travelRadiusKm;

  if (isEstablishedPlayer && hasRatingData && isWithinTravelRadius) {
    return RecommendationConfidenceLevels.HIGH;
  }

  if (input.playerGamesPlayed > 0 || (hasRatingData && isWithinTravelRadius)) {
    return RecommendationConfidenceLevels.MEDIUM;
  }

  return RecommendationConfidenceLevels.LOW;
}
