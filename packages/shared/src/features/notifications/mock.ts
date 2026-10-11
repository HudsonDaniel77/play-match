import {
  NotificationsListResponseSchema,
  type NotificationsListResponse,
} from './contract.js';
import type { MockAdapterOptions } from '../common/errors.js';

export const mockNotificationsData: NotificationsListResponse = {
  notifications: [
    {
      id: 'notif-1',
      userId: 'player-1',
      type: 'game_confirmed',
      title: 'Game Confirmed!',
      message: 'Your badminton singles game at Marina Smash Arena is confirmed.',
      read: false,
      createdAt: new Date().toISOString(),
      data: { gameId: 'demo-game-1' },
    },
    {
      id: 'notif-2',
      userId: 'player-1',
      type: 'rating_updated',
      title: 'Rating Updated (+42.9)',
      message: 'Your badminton Elo rating updated to 1042.9 following your match.',
      read: true,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
  unreadCount: 1,
};

export async function getMockNotifications(
  options: MockAdapterOptions = {},
): Promise<NotificationsListResponse> {
  const { simulatedLatencyMs = 50 } = options;
  if (simulatedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
  }
  return NotificationsListResponseSchema.parse(mockNotificationsData);
}
