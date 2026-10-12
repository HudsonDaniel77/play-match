export const TeamSideKeys = {
  TEAM_A: 'team_a',
  TEAM_B: 'team_b',
} as const;

export type TeamSideKey = (typeof TeamSideKeys)[keyof typeof TeamSideKeys];

export const TeamDisplayNames = {
  [TeamSideKeys.TEAM_A]: 'Team A',
  [TeamSideKeys.TEAM_B]: 'Team B',
} as const;

export const TeamBalanceMethods = {
  SNAKE_DRAFT_ELO: 'snake_draft_elo',
} as const;

export type TeamBalanceMethod = (typeof TeamBalanceMethods)[keyof typeof TeamBalanceMethods];

export const TEAM_FORMATION_SIDE_ORDER: TeamSideKey[] = [
  TeamSideKeys.TEAM_A,
  TeamSideKeys.TEAM_B,
];
