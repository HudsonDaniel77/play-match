export const ScoringTypes = {
  SETS: 'sets',
  RUNS: 'runs',
  GOALS: 'goals',
} as const;

export type ScoringType = (typeof ScoringTypes)[keyof typeof ScoringTypes];
