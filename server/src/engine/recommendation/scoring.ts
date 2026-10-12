import {
  RecommendationFactorNames,
  DEFAULT_RECOMMENDATION_WEIGHTS,
} from '../../constants/recommendation-constants.js';
import type {
  RecommendationEvaluationInput,
  RecommendationFactorOutput,
} from './interfaces.js';

export function calculateSkillMatchScore(
  ratingGap: number | null,
  ratingInRange: boolean,
): number {
  if (ratingGap === null) {
    return 0.75;
  }
  const gap = Math.abs(ratingGap);
  if (gap === 0) return 1.0;

  if (gap <= 50) {
    return ratingInRange ? 1.0 : 0.95;
  }

  if (gap <= 200) {
    const score = 1.0 - gap / 400;
    return Math.round(score * 100) / 100;
  }

  const score = Math.max(0.1, 0.5 - (gap - 200) / 600);
  return Math.round(score * 100) / 100;
}

export function calculateProximityScore(
  distanceKm: number,
  travelRadiusKm: number,
): number {
  const radius = travelRadiusKm > 0 ? travelRadiusKm : 15;
  if (distanceKm <= 0) return 1.0;

  if (distanceKm <= radius) {
    const score = 1.0 - 0.5 * (distanceKm / radius);
    return Math.round(score * 100) / 100;
  }

  const decay = 0.5 * Math.exp(-(distanceKm - radius) / (radius * 0.5));
  const score = Math.max(0.05, decay);
  return Math.round(score * 100) / 100;
}

export function calculateScheduleFitScore(availabilityFit: boolean): number {
  return availabilityFit ? 1.0 : 0.3;
}

export function calculateHostReliabilityScore(
  hostScore: number | null,
): number {
  if (hostScore === null) {
    return 0.8;
  }
  const normalized = Math.max(0, Math.min(100, hostScore)) / 100;
  return Math.round(normalized * 100) / 100;
}

export function calculateFactors(
  input: RecommendationEvaluationInput,
): RecommendationFactorOutput[] {
  return [
    {
      name: RecommendationFactorNames.SKILL_MATCH,
      value: calculateSkillMatchScore(input.ratingGap, input.ratingInRange),
      weight: DEFAULT_RECOMMENDATION_WEIGHTS.SKILL_MATCH,
    },
    {
      name: RecommendationFactorNames.PROXIMITY,
      value: calculateProximityScore(input.distanceKm, input.travelRadiusKm),
      weight: DEFAULT_RECOMMENDATION_WEIGHTS.PROXIMITY,
    },
    {
      name: RecommendationFactorNames.SCHEDULE_FIT,
      value: calculateScheduleFitScore(input.availabilityFit),
      weight: DEFAULT_RECOMMENDATION_WEIGHTS.SCHEDULE_FIT,
    },
    {
      name: RecommendationFactorNames.HOST_RELIABILITY,
      value: calculateHostReliabilityScore(input.hostReliabilityScore),
      weight: DEFAULT_RECOMMENDATION_WEIGHTS.HOST_RELIABILITY,
    },
  ];
}

export function calculateCompositeScore(
  factors: RecommendationFactorOutput[],
): number {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight <= 0) return 0;

  const weightedSum = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
  const score = weightedSum / totalWeight;
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}
