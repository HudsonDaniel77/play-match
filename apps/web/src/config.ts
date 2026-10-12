import type { ClientConfig } from '@playmatch/shared';

export const webClientConfig: ClientConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  timeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 15000,
  pollingIntervalMs: Number(import.meta.env.VITE_QUERY_POLLING_INTERVAL_MS) || 10000,
  features: {
    recommendationsMode: (import.meta.env.VITE_FEATURE_RECOMMENDATIONS_MODE as any) || 'mock',
    teamsMode: (import.meta.env.VITE_FEATURE_TEAMS_MODE as any) || 'mock',
    resultsMode: (import.meta.env.VITE_FEATURE_RESULTS_MODE as any) || 'mock',
    notificationsMode: (import.meta.env.VITE_FEATURE_NOTIFICATIONS_MODE as any) || 'mock',
    reliabilityMode: (import.meta.env.VITE_FEATURE_RELIABILITY_MODE as any) || 'mock',
  },
};
