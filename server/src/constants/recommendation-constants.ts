export const RecommendationFactorNames = {
  SKILL_MATCH: 'Skill Match',
  PROXIMITY: 'Proximity',
  SCHEDULE_FIT: 'Schedule Fit',
  HOST_RELIABILITY: 'Host Reliability',
} as const;

export type RecommendationFactorName =
  (typeof RecommendationFactorNames)[keyof typeof RecommendationFactorNames];

export const RecommendationConfidenceLevels = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export type RecommendationConfidenceLevel =
  (typeof RecommendationConfidenceLevels)[keyof typeof RecommendationConfidenceLevels];

export const DEFAULT_RECOMMENDATION_WEIGHTS = {
  SKILL_MATCH: 0.35,
  PROXIMITY: 0.30,
  SCHEDULE_FIT: 0.20,
  HOST_RELIABILITY: 0.15,
} as const;

export const RECOMMENDATION_LIMITS = {
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 50,
  DEFAULT_MAX_DISTANCE_KM: 30,
  PROVISIONAL_GAMES_THRESHOLD: 10,
  CLOSE_ELO_GAP_POINTS: 50,
  MODERATE_ELO_GAP_POINTS: 150,
} as const;
