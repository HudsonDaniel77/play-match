import type { ClientSession, Types } from 'mongoose';
import { Game, type IGameDocument } from '../models/game.model.js';
import { GameEvent } from '../models/game-event.model.js';
import {
  AllowedGameTransitions,
  GameStatuses,
  GameEventTypes,
  type GameStatus,
  type GameEventType,
} from '../constants/game-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import type { TransactionEventBuffer } from '../utils/domain-events.js';

export interface TransitionGameOptions {
  toStatus: GameStatus;
  actorId?: Types.ObjectId | null;
  actorRole?: 'host' | 'participant' | 'system' | 'admin';
  reason?: string;
  session?: ClientSession;
  eventBuffer?: TransactionEventBuffer;
  clock?: Clock;
  extraEventPayload?: Record<string, unknown>;
}

export async function transitionGame(
  game: IGameDocument,
  options: TransitionGameOptions,
): Promise<IGameDocument> {
  const {
    toStatus,
    actorId,
    actorRole = 'system',
    reason,
    session,
    eventBuffer,
    clock = defaultClock,
    extraEventPayload,
  } = options;

  const currentStatus = game.status;

  if (currentStatus === toStatus) {
    return game;
  }

  // Check state machine
  const allowedNext = AllowedGameTransitions[currentStatus] || [];
  if (!allowedNext.includes(toStatus)) {
    throw new AppError(
      Messages.GAMES.INVALID_STATUS_TRANSITION,
      HttpStatus.CONFLICT,
      ErrorCodes.GAME_STATUS_INVALID,
    );
  }

  // Validate actor permissions on specific transitions
  if (toStatus === GameStatuses.CANCELLED) {
    if (actorRole !== 'host' && actorRole !== 'admin' && actorRole !== 'system') {
      throw new AppError(
        Messages.GAMES.FORBIDDEN_OPERATION,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }
  }

  const now = clock.now();

  game.status = toStatus;
  game.statusHistory.push({
    fromStatus: currentStatus,
    toStatus,
    changedAt: now,
    changedBy: actorId,
    reason,
  });

  await game.save({ session });

  // Map transition to event type
  let eventType: GameEventType = GameEventTypes.STATUS_CHANGED;
  if (toStatus === GameStatuses.CANCELLED) {
    eventType = GameEventTypes.GAME_CANCELLED;
  } else if (toStatus === GameStatuses.CONFIRMED) {
    eventType = GameEventTypes.GAME_CONFIRMED;
  } else if (toStatus === GameStatuses.EXPIRED) {
    eventType = GameEventTypes.GAME_EXPIRED;
  }

  // Persist GameEvent in database
  const [createdEvent] = await GameEvent.create(
    [
      {
        gameId: game._id,
        type: eventType,
        actorId: actorId ?? null,
        payload: {
          fromStatus: currentStatus,
          toStatus,
          reason,
          ...extraEventPayload,
        },
        createdAt: now,
      },
    ],
    { session },
  );

  // If transactional event buffer is supplied, buffer domain event for post-commit dispatch
  if (eventBuffer) {
    eventBuffer.buffer({
      type: eventType,
      gameId: game._id.toString(),
      actorId: actorId?.toString(),
      timestamp: now,
      data: {
        fromStatus: currentStatus,
        toStatus,
        reason,
        ...extraEventPayload,
      },
    });
  }

  return game;
}
