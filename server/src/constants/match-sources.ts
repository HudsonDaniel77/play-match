export const MatchSourceTypes = {
  ADMIN_MANUAL: 'admin_manual',
  GAME: 'game',
} as const;

export type MatchSourceType = (typeof MatchSourceTypes)[keyof typeof MatchSourceTypes];
