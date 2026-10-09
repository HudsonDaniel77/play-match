export const MatchStatuses = {
  APPLIED: 'applied',
  VOIDED: 'voided',
} as const;

export type MatchStatus = (typeof MatchStatuses)[keyof typeof MatchStatuses];
