import type {
  RecommendationConfidenceLevel,
  RecommendationFactorName,
} from '../../constants/recommendation-constants.js';

export interface RecommendationFactorOutput {
  name: RecommendationFactorName;
  value: number; // 0.0 to 1.0
  weight: number; // weight used
}

export interface RecommendationEvaluationInput {
  gameId: string;
  sportKey: string;
  title: string;
  distanceKm: number;
  travelRadiusKm: number;
  ratingGap: number | null; // null if unrated/missing
  ratingInRange: boolean;
  playerGamesPlayed: number;
  availabilityFit: boolean;
  hostReliabilityScore: number | null; // 0-100 or null
  seatsLeft: number;
  totalSeats: number;
}

export interface EvaluatedRecommendation {
  gameId: string;
  sportKey: string;
  title: string;
  score: number; // 0.00 to 1.00
  confidence: RecommendationConfidenceLevel;
  factors: RecommendationFactorOutput[];
  reasons: string[];
}
