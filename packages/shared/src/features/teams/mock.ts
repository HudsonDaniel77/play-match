import {
  TeamSuggestionResponseSchema,
  type TeamSuggestionResponse,
} from './contract.js';
import type { MockAdapterOptions } from '../common/errors.js';

export const mockTeamSuggestionData: TeamSuggestionResponse = {
  teams: [
    {
      sideKey: 'team_a',
      name: 'Team Alpha',
      players: [
        { userId: 'player-1', displayName: 'Player 1', rating: 1200, position: 'Forward' },
        { userId: 'player-2', displayName: 'Player 2', rating: 1050, position: 'Defender' },
      ],
      ratingTotal: 2250,
      ratingAverage: 1125,
    },
    {
      sideKey: 'team_b',
      name: 'Team Beta',
      players: [
        { userId: 'player-3', displayName: 'Player 3', rating: 1180, position: 'Forward' },
        { userId: 'player-4', displayName: 'Player 4', rating: 1070, position: 'Defender' },
      ],
      ratingTotal: 2250,
      ratingAverage: 1125,
    },
  ],
  balance: {
    difference: 0,
    method: 'greedy_elo_balancing',
  },
  reasons: [
    'Zero rating difference between teams',
    'Equal distribution of defensive and offensive players',
  ],
};

export async function getMockTeamSuggestion(
  _gameId: string,
  options: MockAdapterOptions = {},
): Promise<TeamSuggestionResponse> {
  const { simulatedLatencyMs = 50 } = options;
  if (simulatedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
  }
  return TeamSuggestionResponseSchema.parse(mockTeamSuggestionData);
}
