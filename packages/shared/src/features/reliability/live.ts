import { FeatureNotAvailableError } from '../common/errors.js';
import type { ProfileReliabilityResponse } from './contract.js';
import type { ApiClient } from '../../client/api-client.js';

export async function getLiveReliability(
  _client: ApiClient,
  _userId: string,
): Promise<ProfileReliabilityResponse> {
  throw new FeatureNotAvailableError('Reliability Tracking');
}
