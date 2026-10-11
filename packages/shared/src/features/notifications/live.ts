import { FeatureNotAvailableError } from '../common/errors.js';
import type { NotificationsListResponse } from './contract.js';
import type { ApiClient } from '../../client/api-client.js';

export async function getLiveNotifications(
  _client: ApiClient,
): Promise<NotificationsListResponse> {
  throw new FeatureNotAvailableError('Notifications & Chat');
}
