import { FeatureNotAvailableError } from '../common/errors.js';
import type { GameResultResponse } from './contract.js';
import type { ApiClient } from '../../client/api-client.js';

export async function getLiveGameResult(
  _client: ApiClient,
  _gameId: string,
): Promise<GameResultResponse> {
  throw new FeatureNotAvailableError('Result Submission & Verification');
}
