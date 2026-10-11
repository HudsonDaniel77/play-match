import mongoose from 'mongoose';
import { Game } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { GameEvent } from '../models/game-event.model.js';
import { config } from '../config/index.js';
import {
  GameStatuses,
  ParticipantStatuses,
  GameEventTypes,
} from '../constants/game-constants.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import { TransactionEventBuffer } from '../utils/domain-events.js';
import { transitionGame } from './game-transition.service.js';
import { logger } from '../utils/logger.js';

export interface SweepSummary {
  confirmedCount: number;
  expiredCount: number;
  inProgressCount: number;
  completedCount: number;
  staleRequestsExpiredCount: number;
  staleWaitlistExpiredCount: number;
}

/**
 * Background lifecycle sweep:
 * 1. At cutoff: auto-confirm open/full games if participantCount >= minPlayers and count % 2 === 0 (if AUTO_CONFIRM_AT_CUTOFF is true); else expire.
 * 2. At startsAt + grace: transition confirmed games to in_progress.
 * 3. At endsAt + delay: transition in_progress games to completed.
 * 4. Expire stale join requests older than JOIN_REQUEST_AUTO_EXPIRE_HOURS.
 * 5. Expire stale waitlist entries at WAITLIST_AUTO_EXPIRE_MINUTES_BEFORE_START.
 */
export async function runLifecycleSweep(clock: Clock = defaultClock): Promise<SweepSummary> {
  const now = clock.now();
  const summary: SweepSummary = {
    confirmedCount: 0,
    expiredCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    staleRequestsExpiredCount: 0,
    staleWaitlistExpiredCount: 0,
  };

  const cutoffThreshold = new Date(
    now.getTime() + config.JOIN_CUTOFF_MINUTES_BEFORE_START * 60 * 1000,
  );

  // 1. Process games at or past cutoff that are still OPEN or FULL
  const cutoffGames = await Game.find({
    status: { $in: [GameStatuses.OPEN, GameStatuses.FULL] },
    startsAt: { $lte: cutoffThreshold },
  });

  for (const game of cutoffGames) {
    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    try {
      await session.withTransaction(async () => {
        const canAutoConfirm =
          config.AUTO_CONFIRM_AT_CUTOFF &&
          game.participantCount >= game.minPlayers &&
          game.participantCount % 2 === 0;

        if (canAutoConfirm) {
          await transitionGame(game, {
            toStatus: GameStatuses.CONFIRMED,
            actorRole: 'system',
            reason: 'Auto-confirmed at cutoff: roster criteria satisfied',
            session,
            eventBuffer,
            clock,
          });
          summary.confirmedCount++;
        } else {
          await transitionGame(game, {
            toStatus: GameStatuses.EXPIRED,
            actorRole: 'system',
            reason: 'Expired at cutoff: minimum roster criteria not satisfied',
            session,
            eventBuffer,
            clock,
          });
          summary.expiredCount++;
        }
      });
      eventBuffer.commit();
    } catch (err) {
      logger.error({ err, gameId: game._id }, 'Error transitioning game at cutoff during sweep');
    } finally {
      await session.endSession();
    }
  }

  // 2. Confirmed -> In Progress
  const inProgressThreshold = new Date(
    now.getTime() - config.AUTO_IN_PROGRESS_GRACE_MINUTES * 60 * 1000,
  );
  const gamesToStart = await Game.find({
    status: GameStatuses.CONFIRMED,
    startsAt: { $lte: inProgressThreshold },
  });

  for (const game of gamesToStart) {
    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    try {
      await session.withTransaction(async () => {
        await transitionGame(game, {
          toStatus: GameStatuses.IN_PROGRESS,
          actorRole: 'system',
          reason: 'Game started',
          session,
          eventBuffer,
          clock,
        });
        summary.inProgressCount++;
      });
      eventBuffer.commit();
    } catch (err) {
      logger.error({ err, gameId: game._id }, 'Error transitioning game to in_progress during sweep');
    } finally {
      await session.endSession();
    }
  }

  // 3. In Progress -> Completed
  const completedThreshold = new Date(
    now.getTime() - config.AUTO_COMPLETE_DELAY_MINUTES * 60 * 1000,
  );
  const gamesToComplete = await Game.find({
    status: GameStatuses.IN_PROGRESS,
    endsAt: { $lte: completedThreshold },
  });

  for (const game of gamesToComplete) {
    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    try {
      await session.withTransaction(async () => {
        await transitionGame(game, {
          toStatus: GameStatuses.COMPLETED,
          actorRole: 'system',
          reason: 'Game duration elapsed',
          session,
          eventBuffer,
          clock,
        });
        summary.completedCount++;
      });
      eventBuffer.commit();
    } catch (err) {
      logger.error({ err, gameId: game._id }, 'Error transitioning game to completed during sweep');
    } finally {
      await session.endSession();
    }
  }

  // 4. Stale Join Requests
  const requestExpireThreshold = new Date(
    now.getTime() - config.JOIN_REQUEST_AUTO_EXPIRE_HOURS * 60 * 60 * 1000,
  );
  const staleRequests = await GameParticipant.find({
    status: ParticipantStatuses.REQUESTED,
    requestedAt: { $lte: requestExpireThreshold },
  });

  for (const req of staleRequests) {
    req.status = ParticipantStatuses.REMOVED;
    await req.save();
    summary.staleRequestsExpiredCount++;

    await GameEvent.create({
      gameId: req.gameId,
      type: GameEventTypes.REQUEST_EXPIRED,
      actorId: req.userId,
      payload: { reason: 'Join request unapproved after timeout' },
      createdAt: now,
    });
  }

  // 5. Stale waitlists (past waitlist cutoff before start)
  const waitlistCutoffThreshold = new Date(
    now.getTime() + config.WAITLIST_AUTO_EXPIRE_MINUTES_BEFORE_START * 60 * 1000,
  );
  const gamesPastWaitlist = await Game.find({
    startsAt: { $lte: waitlistCutoffThreshold },
    waitlistCount: { $gt: 0 },
  });

  for (const game of gamesPastWaitlist) {
    const expiredWaitlists = await GameParticipant.find({
      gameId: game._id,
      status: ParticipantStatuses.WAITLISTED,
    });

    for (const wl of expiredWaitlists) {
      wl.status = ParticipantStatuses.REMOVED;
      await wl.save();
      summary.staleWaitlistExpiredCount++;

      await GameEvent.create({
        gameId: game._id,
        type: GameEventTypes.WAITLIST_EXPIRED,
        actorId: wl.userId,
        payload: { reason: 'Game cutoff reached without promotion' },
        createdAt: now,
      });
    }

    game.waitlistCount = 0;
    await game.save();
  }

  return summary;
}
