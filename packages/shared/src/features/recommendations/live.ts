import { FeatureNotAvailableError } from '../common/errors.js';
import type { RecommendationsResponse } from './contract.js';
import type { ApiClient } from '../../client/api-client.js';

export async function getLiveRecommendations(
  _client: ApiClient,
): Promise<RecommendationsResponse> {
  throw new FeatureNotAvailableError('AI Recommendations');
}
