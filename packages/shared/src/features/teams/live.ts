import { FeatureNotAvailableError } from '../common/errors.js';
import type { TeamSuggestionResponse } from './contract.js';
import type { ApiClient } from '../../client/api-client.js';

export async function getLiveTeamSuggestion(
  _client: ApiClient,
  _gameId: string,
): Promise<TeamSuggestionResponse> {
  throw new FeatureNotAvailableError('Team Formation & Suggestion');
}
