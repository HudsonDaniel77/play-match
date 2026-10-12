import { useQuery, useMutation, type UseQueryOptions } from '@tanstack/react-query';
import { queryKeys } from './query-keys.js';
import type { ApiClient } from '../client/api-client.js';
import {
  getMockRecommendations,
  getLiveRecommendations,
  type RecommendationsResponse,
} from '../features/recommendations/index.js';
import {
  getMockTeamSuggestion,
  getLiveTeamSuggestion,
  type TeamSuggestionResponse,
} from '../features/teams/index.js';
import {
  getMockGameResult,
  getLiveGameResult,
  type GameResultResponse,
} from '../features/results/index.js';
import {
  getMockNotifications,
  getLiveNotifications,
  type NotificationsListResponse,
} from '../features/notifications/index.js';
import {
  getMockReliability,
  getLiveReliability,
  type ProfileReliabilityResponse,
} from '../features/reliability/index.js';

export function useFeatureRecommendations(
  client: ApiClient,
  options?: Partial<UseQueryOptions<RecommendationsResponse, Error>>,
) {
  const mode = client.getConfig().features?.recommendationsMode || 'mock';
  const isMock = mode === 'mock';

  const query = useQuery({
    queryKey: queryKeys.features.recommendations(),
    queryFn: () => (isMock ? getMockRecommendations() : getLiveRecommendations(client)),
    ...options,
  });

  return { ...query, isMock };
}

export function useFeatureTeamSuggestion(
  client: ApiClient,
  gameId: string,
  options?: Partial<UseQueryOptions<TeamSuggestionResponse, Error>>,
) {
  const mode = client.getConfig().features?.teamsMode || 'mock';
  const isMock = mode === 'mock';

  const query = useQuery({
    queryKey: queryKeys.features.teamSuggestion(gameId),
    queryFn: () => (isMock ? getMockTeamSuggestion(gameId) : getLiveTeamSuggestion(client, gameId)),
    enabled: Boolean(gameId),
    ...options,
  });

  return { ...query, isMock };
}

export function useFeatureGameResult(
  client: ApiClient,
  gameId: string,
  options?: Partial<UseQueryOptions<GameResultResponse, Error>>,
) {
  const mode = client.getConfig().features?.resultsMode || 'mock';
  const isMock = mode === 'mock';

  const query = useQuery({
    queryKey: queryKeys.features.gameResult(gameId),
    queryFn: () => (isMock ? getMockGameResult(gameId) : getLiveGameResult(client, gameId)),
    enabled: Boolean(gameId),
    ...options,
  });

  return { ...query, isMock };
}

export function useFeatureNotifications(
  client: ApiClient,
  options?: Partial<UseQueryOptions<NotificationsListResponse, Error>>,
) {
  const mode = client.getConfig().features?.notificationsMode || 'mock';
  const isMock = mode === 'mock';

  const query = useQuery({
    queryKey: queryKeys.features.notifications(),
    queryFn: () => (isMock ? getMockNotifications() : getLiveNotifications(client)),
    ...options,
  });

  return { ...query, isMock };
}

export function useFeatureReliability(
  client: ApiClient,
  userId: string,
  options?: Partial<UseQueryOptions<ProfileReliabilityResponse, Error>>,
) {
  const mode = client.getConfig().features?.reliabilityMode || 'mock';
  const isMock = mode === 'mock';

  const query = useQuery({
    queryKey: queryKeys.features.reliability(userId),
    queryFn: () => (isMock ? getMockReliability(userId) : getLiveReliability(client, userId)),
    enabled: Boolean(userId),
    ...options,
  });

  return { ...query, isMock };
}
