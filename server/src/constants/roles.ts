export const Roles = {
  PLAYER: 'player',
  VENUE_OWNER: 'venue_owner',
  ADMIN: 'admin',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const ALL_ROLES: readonly Role[] = [
  Roles.PLAYER,
  Roles.VENUE_OWNER,
  Roles.ADMIN,
] as const;

export const DEFAULT_ROLE: Role = Roles.PLAYER;
