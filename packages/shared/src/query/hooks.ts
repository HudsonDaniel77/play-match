import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { queryKeys } from './query-keys.js';
import { invalidateAfterGameJoin, invalidateAfterGameLeave } from './utils/invalidation.js';
import { getNextCursorParam, type CursorPaginatedResponse } from './utils/infinite-query.js';
import type { ApiClient } from '../client/api-client.js';

// --- AUTH HOOKS ---
export function useLogin(client: ApiClient, options?: UseMutationOptions<any, Error, any>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => client.post('/auth/login', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
    ...options,
  });
}

export function useRegister(client: ApiClient, options?: UseMutationOptions<any, Error, any>) {
  return useMutation({
    mutationFn: (body: any) => client.post('/auth/register', body),
    ...options,
  });
}

export function useLogout(client: ApiClient, options?: UseMutationOptions<any, Error, void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.post('/auth/logout', {}),
    onSuccess: () => {
      client.getAdapter().clearSession();
      queryClient.clear();
    },
    ...options,
  });
}

// --- SPORTS CATALOG HOOKS ---
export function useSportsCatalog(client: ApiClient, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.sports.catalog(),
    queryFn: () => client.get('/sports'),
    staleTime: 1000 * 60 * 60, // Sports catalog rarely changes
    ...options,
  });
}

export function useSportDetail(client: ApiClient, sportKey: string, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.sports.detail(sportKey),
    queryFn: () => client.get(`/sports/${sportKey}`),
    enabled: Boolean(sportKey),
    ...options,
  });
}

// --- PROFILE & ONBOARDING HOOKS ---
export function useMyProfile(client: ApiClient, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: () => client.get('/profile/me'),
    ...options,
  });
}

export function useUpdateProfile(client: ApiClient, options?: UseMutationOptions<any, Error, any>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => client.patch('/profile/me', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me() });
    },
    ...options,
  });
}

export function useOnboardingStatus(client: ApiClient, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.profile.onboardingStatus(),
    queryFn: () => client.get('/onboarding/status'),
    ...options,
  });
}

// --- RATINGS & LEADERBOARD HOOKS ---
export function useMyRatings(client: ApiClient, sportKey?: string, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.ratings.me(sportKey),
    queryFn: () => client.get(sportKey ? `/ratings/me/${sportKey}` : '/ratings/me'),
    ...options,
  });
}

export function useRatingHistory(client: ApiClient, sportKey: string, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.ratings.history(sportKey),
    queryFn: () => client.get(`/ratings/me/${sportKey}/history`),
    enabled: Boolean(sportKey),
    ...options,
  });
}

export function useLeaderboardInfinite(client: ApiClient, sportKey: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: queryKeys.ratings.leaderboard(sportKey),
    queryFn: ({ pageParam }) => {
      const url = pageParam
        ? `/leaderboards/${sportKey}?cursor=${pageParam}&limit=${limit}`
        : `/leaderboards/${sportKey}?limit=${limit}`;
      return client.get<CursorPaginatedResponse<any>>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => getNextCursorParam(lastPage),
    enabled: Boolean(sportKey),
  });
}

// --- GAMES HOOKS ---
export function useMyGames(client: ApiClient, options?: Partial<UseQueryOptions<any, Error>>) {
  const pollingInterval = client.getConfig().pollingIntervalMs;
  return useQuery({
    queryKey: queryKeys.games.my(),
    queryFn: () => client.get('/games/me'),
    refetchInterval: pollingInterval,
    ...options,
  });
}

export function useGameDetail(client: ApiClient, gameId: string, options?: Partial<UseQueryOptions<any, Error>>) {
  const pollingInterval = client.getConfig().pollingIntervalMs;
  return useQuery({
    queryKey: queryKeys.games.detail(gameId),
    queryFn: () => client.get(`/games/${gameId}`),
    enabled: Boolean(gameId),
    refetchInterval: pollingInterval,
    ...options,
  });
}

export function useGameRoster(client: ApiClient, gameId: string, options?: Partial<UseQueryOptions<any, Error>>) {
  const pollingInterval = client.getConfig().pollingIntervalMs;
  return useQuery({
    queryKey: queryKeys.games.roster(gameId),
    queryFn: () => client.get(`/games/${gameId}/roster`),
    enabled: Boolean(gameId),
    refetchInterval: pollingInterval,
    ...options,
  });
}

export function useCreateGame(client: ApiClient, options?: UseMutationOptions<any, Error, any>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => client.post('/games', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.my() });
      queryClient.invalidateQueries({ queryKey: queryKeys.discovery.all });
    },
    ...options,
  });
}

export function useJoinGame(client: ApiClient, gameId: string, options?: UseMutationOptions<any, Error, void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.post(`/games/${gameId}/join`, {}),
    onSuccess: async () => {
      await invalidateAfterGameJoin(queryClient, gameId);
    },
    ...options,
  });
}

export function useLeaveGame(client: ApiClient, gameId: string, options?: UseMutationOptions<any, Error, void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.post(`/games/${gameId}/leave`, {}),
    onSuccess: async () => {
      await invalidateAfterGameLeave(queryClient, gameId);
    },
    ...options,
  });
}

// --- DISCOVERY HOOKS ---
export function useDiscoverGames(
  client: ApiClient,
  params: { latitude: number; longitude: number; radiusKm?: number; sportKey?: string },
  options?: Partial<UseQueryOptions<any, Error>>,
) {
  const queryString = new URLSearchParams({
    latitude: params.latitude.toString(),
    longitude: params.longitude.toString(),
    ...(params.radiusKm ? { radiusKm: params.radiusKm.toString() } : {}),
    ...(params.sportKey ? { sportKey: params.sportKey } : {}),
  }).toString();

  return useQuery({
    queryKey: queryKeys.discovery.games(params),
    queryFn: () => client.get(`/games/discover?${queryString}`),
    enabled: Boolean(params.latitude && params.longitude),
    ...options,
  });
}

// --- VENUES HOOKS ---
export function useVenues(client: ApiClient, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.venues.list(),
    queryFn: () => client.get('/venues'),
    ...options,
  });
}

export function useVenueDetail(client: ApiClient, venueId: string, options?: Partial<UseQueryOptions<any, Error>>) {
  return useQuery({
    queryKey: queryKeys.venues.detail(venueId),
    queryFn: () => client.get(`/venues/${venueId}`),
    enabled: Boolean(venueId),
    ...options,
  });
}
