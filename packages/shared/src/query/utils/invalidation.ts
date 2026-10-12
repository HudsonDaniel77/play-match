import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys.js';

/**
 * Coordinated cache invalidation helpers.
 */
export async function invalidateAfterGameJoin(
  queryClient: QueryClient,
  gameId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.games.detail(gameId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.games.roster(gameId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.games.eligibility(gameId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.games.my() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.discovery.all }),
  ]);
}

export async function invalidateAfterGameLeave(
  queryClient: QueryClient,
  gameId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.games.detail(gameId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.games.roster(gameId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.games.eligibility(gameId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.games.my() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.discovery.all }),
  ]);
}
