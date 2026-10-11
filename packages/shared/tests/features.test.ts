import { describe, it, expect } from 'vitest';
import {
  getMockRecommendations,
  getLiveRecommendations,
  RecommendationsResponseSchema,
} from '../src/features/recommendations/index.js';
import {
  getMockTeamSuggestion,
  getLiveTeamSuggestion,
  TeamSuggestionResponseSchema,
} from '../src/features/teams/index.js';
import {
  getMockGameResult,
  getLiveGameResult,
  GameResultResponseSchema,
} from '../src/features/results/index.js';
import {
  getMockNotifications,
  getLiveNotifications,
  NotificationsListResponseSchema,
} from '../src/features/notifications/index.js';
import {
  getMockReliability,
  getLiveReliability,
  ProfileReliabilityResponseSchema,
} from '../src/features/reliability/index.js';
import { FeatureNotAvailableError } from '../src/features/common/errors.js';
import { ApiClient } from '../src/client/api-client.js';
import { WebAuthAdapter } from '../src/client/adapters/web.js';

describe('Future Features Mock Seam Tests', () => {
  const dummyClient = new ApiClient({ baseUrl: 'http://localhost:5000/api/v1' }, new WebAuthAdapter());

  it('validates mock recommendations fixture against schema and live returns error', async () => {
    const data = await getMockRecommendations({ simulatedLatencyMs: 0 });
    expect(RecommendationsResponseSchema.safeParse(data).success).toBe(true);

    await expect(getLiveRecommendations(dummyClient)).rejects.toThrow(FeatureNotAvailableError);
  });

  it('validates mock teams fixture against schema and live returns error', async () => {
    const data = await getMockTeamSuggestion('g1', { simulatedLatencyMs: 0 });
    expect(TeamSuggestionResponseSchema.safeParse(data).success).toBe(true);

    await expect(getLiveTeamSuggestion(dummyClient, 'g1')).rejects.toThrow(FeatureNotAvailableError);
  });

  it('validates mock results fixture against schema and live returns error', async () => {
    const data = await getMockGameResult('g1', { simulatedLatencyMs: 0 });
    expect(GameResultResponseSchema.safeParse(data).success).toBe(true);

    await expect(getLiveGameResult(dummyClient, 'g1')).rejects.toThrow(FeatureNotAvailableError);
  });

  it('validates mock notifications fixture against schema and live returns error', async () => {
    const data = await getMockNotifications({ simulatedLatencyMs: 0 });
    expect(NotificationsListResponseSchema.safeParse(data).success).toBe(true);

    await expect(getLiveNotifications(dummyClient)).rejects.toThrow(FeatureNotAvailableError);
  });

  it('validates mock reliability fixture against schema and live returns error', async () => {
    const data = await getMockReliability('u1', { simulatedLatencyMs: 0 });
    expect(ProfileReliabilityResponseSchema.safeParse(data).success).toBe(true);

    await expect(getLiveReliability(dummyClient, 'u1')).rejects.toThrow(FeatureNotAvailableError);
  });
});
