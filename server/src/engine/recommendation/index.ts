import type {
  RecommendationEvaluationInput,
  EvaluatedRecommendation,
} from './interfaces.js';
import { calculateFactors, calculateCompositeScore } from './scoring.js';
import { evaluateConfidence } from './confidence.js';
import { generateRecommendationReasons } from './reason-generator.js';

export * from './interfaces.js';
export * from './scoring.js';
export * from './confidence.js';
export * from './reason-generator.js';

export function evaluateGameRecommendation(
  input: RecommendationEvaluationInput,
): EvaluatedRecommendation {
  const factors = calculateFactors(input);
  const score = calculateCompositeScore(factors);
  const confidence = evaluateConfidence(input);
  const reasons = generateRecommendationReasons(input);

  return {
    gameId: input.gameId,
    sportKey: input.sportKey,
    title: input.title,
    score,
    confidence,
    factors,
    reasons,
  };
}
