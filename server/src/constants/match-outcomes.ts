export const MatchOutcomes = {
  SIDE_A_WIN: 'side_a_win',
  SIDE_B_WIN: 'side_b_win',
  DRAW: 'draw',
} as const;

export type MatchOutcome = (typeof MatchOutcomes)[keyof typeof MatchOutcomes];
