export const UserStatuses = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;

export type UserStatus = (typeof UserStatuses)[keyof typeof UserStatuses];

export const ALL_USER_STATUSES: readonly UserStatus[] = [
  UserStatuses.ACTIVE,
  UserStatuses.SUSPENDED,
] as const;

export const DEFAULT_USER_STATUS: UserStatus = UserStatuses.ACTIVE;
