export const Collections = {
  USERS: 'users',
  REFRESH_SESSIONS: 'refresh_sessions',
  ONE_TIME_TOKENS: 'one_time_tokens',
  SPORTS: 'sports',
  PROFILES: 'profiles',
  SPORT_PROFILES: 'sport_profiles',
  RATINGS: 'ratings',
  MATCH_RESULTS: 'match_results',
  RATING_EVENTS: 'rating_events',
  GAMES: 'games',
  GAME_PARTICIPANTS: 'game_participants',
  GAME_EVENTS: 'game_events',
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];
