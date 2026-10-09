export const Collections = {
  USERS: 'users',
  REFRESH_SESSIONS: 'refresh_sessions',
  ONE_TIME_TOKENS: 'one_time_tokens',
  SPORTS: 'sports',
  PROFILES: 'profiles',
  SPORT_PROFILES: 'sport_profiles',
  RATINGS: 'ratings',
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];
