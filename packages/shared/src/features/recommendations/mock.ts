import {
  RecommendationsResponseSchema,
  type RecommendationsResponse,
} from './contract.js';
import type { MockAdapterOptions } from '../common/errors.js';

export const mockRecommendationsData: RecommendationsResponse = {
  items: [
    {
      gameId: 'rec-game-badminton-1',
      sportKey: 'badminton',
      title: 'Intermediate Evening Singles',
      score: 0.94,
      confidence: 'high',
      factors: [
        { name: 'Skill Match', value: 0.96, weight: 0.4 },
        { name: 'Proximity', value: 0.92, weight: 0.35 },
        { name: 'Schedule Fit', value: 0.95, weight: 0.25 },
      ],
      reasons: [
        'Close skill match (within 40 Elo points)',
        'Located within 2.5 km of your primary location',
        'Matches your preferred Friday evening availability',
      ],
    },
    {
      gameId: 'rec-game-football-2',
      sportKey: 'football',
      title: 'Weekend 5-a-side Friendly',
      score: 0.82,
      confidence: 'medium',
      factors: [
        { name: 'Skill Match', value: 0.8, weight: 0.4 },
        { name: 'Proximity', value: 0.85, weight: 0.35 },
        { name: 'Schedule Fit', value: 0.8, weight: 0.25 },
      ],
      reasons: [
        'Organized by reliable hosts in your travel radius',
        '3 open spots remaining',
      ],
    },
  ],
};

export async function getMockRecommendations(
  options: MockAdapterOptions = {},
): Promise<RecommendationsResponse> {
  const { simulatedLatencyMs = 50 } = options;
  if (simulatedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
  }
  // Validate fixture strictly against schema
  return RecommendationsResponseSchema.parse(mockRecommendationsData);
}
