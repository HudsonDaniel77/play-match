export const queryKeys = {
  // Auth
  auth: {
    all: ['auth'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
  },

  // Sports
  sports: {
    all: ['sports'] as const,
    catalog: () => [...queryKeys.sports.all, 'catalog'] as const,
    detail: (sportKey: string) => [...queryKeys.sports.all, 'detail', sportKey] as const,
  },

  // Profile & Onboarding
  profile: {
    all: ['profile'] as const,
    me: () => [...queryKeys.profile.all, 'me'] as const,
    user: (userId: string) => [...queryKeys.profile.all, 'user', userId] as const,
    onboardingStatus: () => [...queryKeys.profile.all, 'onboarding-status'] as const,
  },

  // Ratings & Leaderboards
  ratings: {
    all: ['ratings'] as const,
    me: (sportKey?: string) => [...queryKeys.ratings.all, 'me', sportKey || 'all'] as const,
    history: (sportKey: string) => [...queryKeys.ratings.all, 'history', sportKey] as const,
    leaderboard: (sportKey: string) => [...queryKeys.ratings.all, 'leaderboard', sportKey] as const,
  },

  // Games
  games: {
    all: ['games'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.games.all, 'list', filters || {}] as const,
    my: (status?: string) => [...queryKeys.games.all, 'my', status || 'all'] as const,
    detail: (gameId: string) => [...queryKeys.games.all, 'detail', gameId] as const,
    roster: (gameId: string) => [...queryKeys.games.all, 'roster', gameId] as const,
    eligibility: (gameId: string) => [...queryKeys.games.all, 'eligibility', gameId] as const,
  },

  // Discovery
  discovery: {
    all: ['discovery'] as const,
    games: (params: Record<string, unknown>) => [...queryKeys.discovery.all, 'games', params] as const,
    venues: (params: Record<string, unknown>) => [...queryKeys.discovery.all, 'venues', params] as const,
  },

  // Venues
  venues: {
    all: ['venues'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.venues.all, 'list', filters || {}] as const,
    detail: (venueId: string) => [...queryKeys.venues.all, 'detail', venueId] as const,
    courts: (venueId: string) => [...queryKeys.venues.all, 'courts', venueId] as const,
    availability: (venueId: string, courtId: string, date: string) =>
      [...queryKeys.venues.all, 'availability', venueId, courtId, date] as const,
  },

  // Future features
  features: {
    all: ['features'] as const,
    recommendations: () => [...queryKeys.features.all, 'recommendations'] as const,
    teamSuggestion: (gameId: string) => [...queryKeys.features.all, 'teams', gameId] as const,
    gameResult: (gameId: string) => [...queryKeys.features.all, 'result', gameId] as const,
    notifications: () => [...queryKeys.features.all, 'notifications'] as const,
    reliability: (userId: string) => [...queryKeys.features.all, 'reliability', userId] as const,
  },
};
