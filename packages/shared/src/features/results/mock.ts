import {
  GameResultResponseSchema,
  type GameResultResponse,
} from './contract.js';
import type { MockAdapterOptions } from '../common/errors.js';

export const mockGameResultData: GameResultResponse = {
  gameId: 'game-result-badminton-1',
  status: 'pending_confirmation',
  proposal: {
    proposedByUserId: 'player-host-1',
    proposedAt: new Date().toISOString(),
    scores: [
      { sideKey: 'side_a', score: 21, winner: true },
      { sideKey: 'side_b', score: 18, winner: false },
    ],
    notes: 'Competitive close match in final set.',
  },
  whoMustActNext: ['player-opponent-2'],
  ratingStatus: 'not_processed',
};

export async function getMockGameResult(
  _gameId: string,
  options: MockAdapterOptions = {},
): Promise<GameResultResponse> {
  const { simulatedLatencyMs = 50 } = options;
  if (simulatedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
  }
  return GameResultResponseSchema.parse(mockGameResultData);
}
