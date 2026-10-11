import type { ClientConfig } from '@playmatch/shared';

export const mobileClientConfig: ClientConfig = {
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:5000/api/v1',
  timeoutMs: Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS) || 15000,
  pollingIntervalMs: Number(process.env.EXPO_PUBLIC_QUERY_POLLING_INTERVAL_MS) || 10000,
  features: {
    recommendationsMode: (process.env.EXPO_PUBLIC_FEATURE_RECOMMENDATIONS_MODE as any) || 'mock',
    teamsMode: (process.env.EXPO_PUBLIC_FEATURE_TEAMS_MODE as any) || 'mock',
    resultsMode: (process.env.EXPO_PUBLIC_FEATURE_RESULTS_MODE as any) || 'mock',
    notificationsMode: (process.env.EXPO_PUBLIC_FEATURE_NOTIFICATIONS_MODE as any) || 'mock',
    reliabilityMode: (process.env.EXPO_PUBLIC_FEATURE_RELIABILITY_MODE as any) || 'mock',
  },
};
