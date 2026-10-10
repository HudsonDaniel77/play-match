export interface RatingEngineConfig {
  scaleDivisor: number;
  kTiers: Array<{ upToGames?: number | null; k: number }>;
  movEnabled: boolean;
  movWeight: number;
  ratingMin: number;
  ratingMax: number;
  ratingDecimals: number;
  inactivityDays: number;
  inactivityKMultiplier: number;
  confidenceGamesThreshold: number;
  confidenceRecencyHalfLifeDays: number;
}

export interface SportScoringConfig {
  scoringType?: 'sets' | 'runs' | 'goals' | string;
  movWeight?: number;
}

export interface SkillBandDefinition {
  key: string;
  label: string;
  order: number;
  seedRating: number;
}

export interface PlayerInput {
  userId: string;
  rating: number;
  gamesPlayed: number;
  lastRatedAt: Date | null;
}

export interface MatchSideInput {
  sideKey: string;
  players: PlayerInput[];
  score: number;
}

export interface PlayerDeltaCalculation {
  userId: string;
  sideKey: string;
  oldRating: number;
  newRating: number;
  delta: number;
  expectedScore: number;
  outcomeScore: number;
  ownTeamRating: number;
  opponentTeamRating: number;
  kUsed: number;
  kBaseTier: number;
  inactivityMultiplier: number;
  movMultiplier: number;
  gamesPlayedBefore: number;
  bandBefore: { key: string; label: string };
  bandAfter: { key: string; label: string };
}
