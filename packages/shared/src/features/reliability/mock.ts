import {
  ProfileReliabilityResponseSchema,
  type ProfileReliabilityResponse,
} from './contract.js';
import type { MockAdapterOptions } from '../common/errors.js';

export const mockReliabilityData: ProfileReliabilityResponse = {
  userId: 'player-1',
  reliability: {
    score: 98,
    tier: 'platinum',
    gamesCounted: 12,
    onTimeLeaves: 1,
    lateLeaves: 0,
    noShows: 0,
  },
};

export async function getMockReliability(
  _userId: string,
  options: MockAdapterOptions = {},
): Promise<ProfileReliabilityResponse> {
  const { simulatedLatencyMs = 50 } = options;
  if (simulatedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
  }
  return ProfileReliabilityResponseSchema.parse(mockReliabilityData);
}
