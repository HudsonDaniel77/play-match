import mongoose, { Types, type ClientSession } from 'mongoose';
import { Game, type IGameDocument } from '../models/game.model.js';
import { GameParticipant, type IGameParticipantDocument } from '../models/game-participant.model.js';
import { GameEvent } from '../models/game-event.model.js';
import { config } from '../config/index.js';
import {
  GameStatuses,
  JoinPolicies,
  ParticipantRoles,
  ParticipantStatuses,
  LeaveTypes,
  GameEventTypes,
  EligibilityReasonCodes,
  type ParticipantStatus,
} from '../constants/game-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import { TransactionEventBuffer } from '../utils/domain-events.js';
import { checkEligibility } from './game-eligibility.service.js';
import { transitionGame } from './game-transition.service.js';

export class GameParticipantService {
  /**
   * Helper to evaluate and update confirmed game status when participant count changes.
   * Requirement 4: Define behavior when a participant leaves or is removed from a CONFIRMED game.
   * If roster becomes invalid (< minPlayers or odd count), transition back to OPEN (or FULL).
   */
  private static async reevaluateGameStatusAfterParticipantLoss(
    game: IGameDocument,
    session: ClientSession,
    eventBuffer: TransactionEventBuffer,
    clock: Clock,
  ): Promise<void> {
    if (game.status === GameStatuses.CONFIRMED) {
      const isInvalidRoster =
        game.participantCount < game.minPlayers || game.participantCount % 2 !== 0;

      if (isInvalidRoster) {
        const nextStatus =
          game.participantCount >= game.maxPlayers ? GameStatuses.FULL : GameStatuses.OPEN;
        await transitionGame(game, {
          toStatus: nextStatus,
          actorRole: 'system',
          reason: 'Participant left/removed, roster no longer meets confirmation requirements',
          session,
          eventBuffer,
          clock,
        });
      }
    } else if (game.status === GameStatuses.FULL && game.participantCount < game.maxPlayers) {
      await transitionGame(game, {
        toStatus: GameStatuses.OPEN,
        actorRole: 'system',
        reason: 'Seat opened up',
        session,
        eventBuffer,
        clock,
      });
    }
  }

  /**
   * Attempt to promote the oldest waitlisted player into the open seat
   */
  private static async tryPromoteWaitlistedParticipant(
    game: IGameDocument,
    session: ClientSession,
    eventBuffer: TransactionEventBuffer,
    clock: Clock,
  ): Promise<boolean> {
    while (game.waitlistCount > 0 && game.participantCount < game.maxPlayers) {
      // Find oldest waitlisted
      const candidate = await GameParticipant.findOne({
        gameId: game._id,
        status: ParticipantStatuses.WAITLISTED,
      })
        .sort({ waitlistedAt: 1 })
        .session(session);

      if (!candidate) {
        game.waitlistCount = 0;
        await game.save({ session });
        break;
      }

      // Check candidate's eligibility and schedule conflicts
      const eligibility = await checkEligibility(candidate.userId, game, clock);
      // Exclude ALREADY_PARTICIPANT since candidate is currently waitlisted
      const blockingReasons = eligibility.reasons.filter(
        (r) => r !== EligibilityReasonCodes.ALREADY_PARTICIPANT,
      );

      if (blockingReasons.length > 0) {
        // Candidate is no longer eligible (e.g. schedule conflict), mark expired and decrement waitlist
        candidate.status = ParticipantStatuses.REMOVED;
        await candidate.save({ session });
        game.waitlistCount = Math.max(0, game.waitlistCount - 1);
        await game.save({ session });

        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.WAITLIST_EXPIRED,
              actorId: candidate.userId,
              payload: { reason: 'No longer eligible at promotion time', blockingReasons },
              createdAt: clock.now(),
            },
          ],
          { session },
        );
        continue; // Try next candidate
      }

      // Candidate is eligible! Promote them
      candidate.status = ParticipantStatuses.JOINED;
      candidate.joinedAt = clock.now();
      await candidate.save({ session });

      game.participantCount += 1;
      game.waitlistCount = Math.max(0, game.waitlistCount - 1);
      if (game.participantCount >= game.maxPlayers) {
        game.status = GameStatuses.FULL;
      }
      await game.save({ session });

      await GameEvent.create(
        [
          {
            gameId: game._id,
            type: GameEventTypes.PARTICIPANT_PROMOTED,
            actorId: candidate.userId,
            payload: { joinedAt: candidate.joinedAt },
            createdAt: clock.now(),
          },
        ],
        { session },
      );

      eventBuffer.buffer({
        type: GameEventTypes.PARTICIPANT_PROMOTED,
        gameId: game._id.toString(),
        actorId: candidate.userId.toString(),
        timestamp: clock.now(),
      });

      return true;
    }

    return false;
  }

  static async joinGame(
    userId: Types.ObjectId | string,
    gameId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<{ status: ParticipantStatus; message: string }> {
    const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const now = clock.now();

    // 1. Initial pre-flight checks
    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const eligibility = await checkEligibility(userObjectId, game, clock);
    if (!eligibility.eligible) {
      const primaryReason = eligibility.reasons[0];
      if (primaryReason === EligibilityReasonCodes.ALREADY_PARTICIPANT) {
        throw new AppError(
          Messages.GAMES.ALREADY_JOINED,
          HttpStatus.CONFLICT,
          ErrorCodes.GAME_ALREADY_JOINED,
        );
      }
      if (primaryReason === EligibilityReasonCodes.GAME_NOT_OPEN) {
        throw new AppError(
          Messages.GAMES.INVALID_STATUS_TRANSITION,
          HttpStatus.CONFLICT,
          ErrorCodes.GAME_STATUS_INVALID,
        );
      }
      if (primaryReason === EligibilityReasonCodes.PAST_JOIN_CUTOFF) {
        throw new AppError(
          Messages.GAMES.PAST_CUTOFF,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.GAME_PAST_CUTOFF,
        );
      }
      if (primaryReason === EligibilityReasonCodes.SPORT_NOT_IN_PROFILE) {
        throw new AppError(
          Messages.GAMES.SPORT_NOT_IN_PROFILE,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.GAME_SPORT_NOT_IN_PROFILE,
        );
      }
      if (primaryReason === EligibilityReasonCodes.OUTSIDE_RATING_RANGE) {
        throw new AppError(
          Messages.GAMES.OUTSIDE_RATING_RANGE,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.GAME_OUTSIDE_RATING_RANGE,
        );
      }
      if (primaryReason === EligibilityReasonCodes.SCHEDULE_CONFLICT) {
        throw new AppError(
          Messages.GAMES.SCHEDULE_CONFLICT,
          HttpStatus.CONFLICT,
          ErrorCodes.GAME_SCHEDULE_CONFLICT,
        );
      }
    }

    // 2. Branch depending on JoinPolicy (APPROVAL vs OPEN)
    if (game.joinPolicy === JoinPolicies.APPROVAL) {
      // Host approval required
      const session = await mongoose.startSession();
      const eventBuffer = new TransactionEventBuffer();

      try {
        await session.withTransaction(async () => {
          await GameParticipant.create(
            [
              {
                gameId: game._id,
                userId: userObjectId,
                role: ParticipantRoles.PLAYER,
                status: ParticipantStatuses.REQUESTED,
                requestedAt: now,
                userRatingAtJoin: eligibility.userRating,
                startsAt: game.startsAt,
                endsAt: game.endsAt,
              },
            ],
            { session },
          );

          await GameEvent.create(
            [
              {
                gameId: game._id,
                type: GameEventTypes.PARTICIPANT_REQUESTED,
                actorId: userObjectId,
                createdAt: now,
              },
            ],
            { session },
          );

          eventBuffer.buffer({
            type: GameEventTypes.PARTICIPANT_REQUESTED,
            gameId: game._id.toString(),
            actorId: userObjectId.toString(),
            timestamp: now,
          });
        });
      } finally {
        await session.endSession();
      }

      eventBuffer.commit();
      return {
        status: ParticipantStatuses.REQUESTED,
        message: Messages.GAMES.JOIN_REQUEST_SUBMITTED,
      };
    }

    // Direct join policy: Attempt atomic seat claim
    // Requirement 1: seat claim removes version from atomic filter (uses participantCount < maxPlayers only).
    // Status change to full happens in the same transaction.
    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    let finalStatus: ParticipantStatus;

    try {
      await session.withTransaction(async () => {
        const updatedGame = await Game.findOneAndUpdate(
          {
            _id: game._id,
            status: { $in: [GameStatuses.OPEN, GameStatuses.FULL] },
            participantCount: { $lt: game.maxPlayers },
          },
          {
            $inc: { participantCount: 1 },
          },
          { new: true, session },
        );

        if (updatedGame) {
          // Seat acquired! If full, update status to full in the same transaction
          if (updatedGame.participantCount >= updatedGame.maxPlayers) {
            updatedGame.status = GameStatuses.FULL;
            updatedGame.statusHistory.push({
              fromStatus: GameStatuses.OPEN,
              toStatus: GameStatuses.FULL,
              changedAt: now,
              reason: 'Game is now full',
            });
            await updatedGame.save({ session });

            await GameEvent.create(
              [
                {
                  gameId: game._id,
                  type: GameEventTypes.STATUS_CHANGED,
                  payload: { fromStatus: GameStatuses.OPEN, toStatus: GameStatuses.FULL },
                  createdAt: now,
                },
              ],
              { session },
            );
          }

          // Create GameParticipant
          await GameParticipant.create(
            [
              {
                gameId: game._id,
                userId: userObjectId,
                role: ParticipantRoles.PLAYER,
                status: ParticipantStatuses.JOINED,
                joinedAt: now,
                userRatingAtJoin: eligibility.userRating,
                startsAt: game.startsAt,
                endsAt: game.endsAt,
              },
            ],
            { session },
          );

          await GameEvent.create(
            [
              {
                gameId: game._id,
                type: GameEventTypes.PARTICIPANT_JOINED,
                actorId: userObjectId,
                createdAt: now,
              },
            ],
            { session },
          );

          eventBuffer.buffer({
            type: GameEventTypes.PARTICIPANT_JOINED,
            gameId: game._id.toString(),
            actorId: userObjectId.toString(),
            timestamp: now,
          });

          finalStatus = ParticipantStatuses.JOINED;
        } else {
          // Game is full: Join waitlist atomically
          // Requirement 7: Use an atomic waitlist counter on the game, inside the transaction.
          const waitlistGame = await Game.findOneAndUpdate(
            {
              _id: game._id,
              waitlistCount: { $lt: config.WAITLIST_MAX_SIZE },
            },
            {
              $inc: { waitlistCount: 1 },
            },
            { new: true, session },
          );

          if (!waitlistGame) {
            throw new AppError(
              Messages.GAMES.WAITLIST_FULL,
              HttpStatus.CONFLICT,
              ErrorCodes.GAME_WAITLIST_FULL,
            );
          }

          await GameParticipant.create(
            [
              {
                gameId: game._id,
                userId: userObjectId,
                role: ParticipantRoles.PLAYER,
                status: ParticipantStatuses.WAITLISTED,
                waitlistedAt: now,
                userRatingAtJoin: eligibility.userRating,
                startsAt: game.startsAt,
                endsAt: game.endsAt,
              },
            ],
            { session },
          );

          await GameEvent.create(
            [
              {
                gameId: game._id,
                type: GameEventTypes.PARTICIPANT_WAITLISTED,
                actorId: userObjectId,
                createdAt: now,
              },
            ],
            { session },
          );

          eventBuffer.buffer({
            type: GameEventTypes.PARTICIPANT_WAITLISTED,
            gameId: game._id.toString(),
            actorId: userObjectId.toString(),
            timestamp: now,
          });

          finalStatus = ParticipantStatuses.WAITLISTED;
        }
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
    return {
      status: finalStatus!,
      message:
        finalStatus! === ParticipantStatuses.JOINED
          ? Messages.GAMES.JOIN_SUCCESS
          : Messages.GAMES.WAITLIST_SUCCESS,
    };
  }

  static async leaveGame(
    userId: Types.ObjectId | string,
    gameId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<{ leaveType: string }> {
    const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const now = clock.now();

    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    // Host cannot leave game
    if (game.hostId.toString() === userObjectId.toString()) {
      throw new AppError(
        Messages.GAMES.HOST_CANNOT_LEAVE,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.GAME_HOST_CANNOT_LEAVE,
      );
    }

    const participant = await GameParticipant.findOne({
      gameId: game._id,
      userId: userObjectId,
      status: {
        $in: [
          ParticipantStatuses.JOINED,
          ParticipantStatuses.REQUESTED,
          ParticipantStatuses.WAITLISTED,
        ],
      },
    });

    if (!participant) {
      throw new AppError(
        Messages.GAMES.NOT_PARTICIPANT,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    let leaveType = LeaveTypes.ON_TIME;

    try {
      await session.withTransaction(async () => {
        const wasJoined = participant.status === ParticipantStatuses.JOINED;
        const wasWaitlisted = participant.status === ParticipantStatuses.WAITLISTED;

        if (wasJoined) {
          const leaveCutoff = new Date(
            game.startsAt.getTime() - config.LEAVE_CUTOFF_MINUTES_BEFORE_START * 60 * 1000,
          );
          if (now > leaveCutoff) {
            leaveType = LeaveTypes.LATE as any;
          }

          participant.status = ParticipantStatuses.LEFT;
          participant.leftAt = now;
          participant.leaveType = leaveType;
          await participant.save({ session });

          game.participantCount = Math.max(1, game.participantCount - 1);
          await game.save({ session });

          // Try waitlist promotion first
          const promoted = await this.tryPromoteWaitlistedParticipant(
            game,
            session,
            eventBuffer,
            clock,
          );

          if (!promoted) {
            // Re-evaluate game status (confirmed -> open, or full -> open)
            await this.reevaluateGameStatusAfterParticipantLoss(
              game,
              session,
              eventBuffer,
              clock,
            );
          }
        } else if (wasWaitlisted) {
          participant.status = ParticipantStatuses.LEFT;
          participant.leftAt = now;
          await participant.save({ session });

          game.waitlistCount = Math.max(0, game.waitlistCount - 1);
          await game.save({ session });
        } else {
          // REQUESTED
          participant.status = ParticipantStatuses.LEFT;
          participant.leftAt = now;
          await participant.save({ session });
        }

        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.PARTICIPANT_LEFT,
              actorId: userObjectId,
              payload: { leaveType },
              createdAt: now,
            },
          ],
          { session },
        );

        eventBuffer.buffer({
          type: GameEventTypes.PARTICIPANT_LEFT,
          gameId: game._id.toString(),
          actorId: userObjectId.toString(),
          timestamp: now,
          data: { leaveType },
        });
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
    return { leaveType };
  }

  static async approveRequest(
    hostId: Types.ObjectId | string,
    gameId: Types.ObjectId | string,
    targetUserId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<void> {
    const hostObjectId = typeof hostId === 'string' ? new Types.ObjectId(hostId) : hostId;
    const targetObjectId =
      typeof targetUserId === 'string' ? new Types.ObjectId(targetUserId) : targetUserId;
    const now = clock.now();

    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    if (game.hostId.toString() !== hostObjectId.toString()) {
      throw new AppError(
        Messages.GAMES.FORBIDDEN_OPERATION,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    const participant = await GameParticipant.findOne({
      gameId: game._id,
      userId: targetObjectId,
      status: ParticipantStatuses.REQUESTED,
    });

    if (!participant) {
      throw new AppError(
        Messages.GAMES.NO_PENDING_REQUEST,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    // Re-verify schedule conflicts upon approval
    const eligibility = await checkEligibility(targetObjectId, game, clock);
    const blockingReasons = eligibility.reasons.filter(
      (r) => r !== EligibilityReasonCodes.ALREADY_PARTICIPANT,
    );
    if (blockingReasons.includes(EligibilityReasonCodes.SCHEDULE_CONFLICT)) {
      throw new AppError(
        Messages.GAMES.SCHEDULE_CONFLICT,
        HttpStatus.CONFLICT,
        ErrorCodes.GAME_SCHEDULE_CONFLICT,
      );
    }

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();

    try {
      await session.withTransaction(async () => {
        // Atomic seat claim
        const updatedGame = await Game.findOneAndUpdate(
          {
            _id: game._id,
            participantCount: { $lt: game.maxPlayers },
          },
          {
            $inc: { participantCount: 1 },
          },
          { new: true, session },
        );

        if (!updatedGame) {
          throw new AppError(
            Messages.GAMES.ALREADY_FULL,
            HttpStatus.CONFLICT,
            ErrorCodes.GAME_FULL,
          );
        }

        participant.status = ParticipantStatuses.JOINED;
        participant.joinedAt = now;
        await participant.save({ session });

        if (updatedGame.participantCount >= updatedGame.maxPlayers) {
          updatedGame.status = GameStatuses.FULL;
          updatedGame.statusHistory.push({
            fromStatus: GameStatuses.OPEN,
            toStatus: GameStatuses.FULL,
            changedAt: now,
            reason: 'Game is now full after approval',
          });
          await updatedGame.save({ session });
        }

        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.PARTICIPANT_APPROVED,
              actorId: hostObjectId,
              payload: { targetUserId: targetObjectId },
              createdAt: now,
            },
          ],
          { session },
        );

        eventBuffer.buffer({
          type: GameEventTypes.PARTICIPANT_APPROVED,
          gameId: game._id.toString(),
          actorId: hostObjectId.toString(),
          timestamp: now,
          data: { targetUserId: targetObjectId.toString() },
        });
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
  }

  static async declineRequest(
    hostId: Types.ObjectId | string,
    gameId: Types.ObjectId | string,
    targetUserId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<void> {
    const hostObjectId = typeof hostId === 'string' ? new Types.ObjectId(hostId) : hostId;
    const targetObjectId =
      typeof targetUserId === 'string' ? new Types.ObjectId(targetUserId) : targetUserId;
    const now = clock.now();

    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    if (game.hostId.toString() !== hostObjectId.toString()) {
      throw new AppError(
        Messages.GAMES.FORBIDDEN_OPERATION,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    const participant = await GameParticipant.findOne({
      gameId: game._id,
      userId: targetObjectId,
      status: ParticipantStatuses.REQUESTED,
    });

    if (!participant) {
      throw new AppError(
        Messages.GAMES.NO_PENDING_REQUEST,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();

    try {
      await session.withTransaction(async () => {
        participant.status = ParticipantStatuses.DECLINED;
        participant.declinedAt = now;
        await participant.save({ session });

        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.PARTICIPANT_DECLINED,
              actorId: hostObjectId,
              payload: { targetUserId: targetObjectId },
              createdAt: now,
            },
          ],
          { session },
        );

        eventBuffer.buffer({
          type: GameEventTypes.PARTICIPANT_DECLINED,
          gameId: game._id.toString(),
          actorId: hostObjectId.toString(),
          timestamp: now,
          data: { targetUserId: targetObjectId.toString() },
        });
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
  }

  static async removeParticipant(
    hostId: Types.ObjectId | string,
    gameId: Types.ObjectId | string,
    targetUserId: Types.ObjectId | string,
    reason?: string,
    clock: Clock = defaultClock,
  ): Promise<void> {
    const hostObjectId = typeof hostId === 'string' ? new Types.ObjectId(hostId) : hostId;
    const targetObjectId =
      typeof targetUserId === 'string' ? new Types.ObjectId(targetUserId) : targetUserId;
    const now = clock.now();

    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    if (game.hostId.toString() !== hostObjectId.toString()) {
      throw new AppError(
        Messages.GAMES.FORBIDDEN_OPERATION,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    if (targetObjectId.toString() === hostObjectId.toString()) {
      throw new AppError(
        Messages.GAMES.HOST_CANNOT_LEAVE,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.GAME_HOST_CANNOT_LEAVE,
      );
    }

    const participant = await GameParticipant.findOne({
      gameId: game._id,
      userId: targetObjectId,
      status: ParticipantStatuses.JOINED,
    });

    if (!participant) {
      throw new AppError(
        Messages.GAMES.NOT_PARTICIPANT,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();

    try {
      await session.withTransaction(async () => {
        participant.status = ParticipantStatuses.REMOVED;
        participant.removedAt = now;
        participant.removedBy = hostObjectId;
        participant.removeReason = reason;
        await participant.save({ session });

        game.participantCount = Math.max(1, game.participantCount - 1);
        await game.save({ session });

        // Try waitlist promotion first
        const promoted = await this.tryPromoteWaitlistedParticipant(
          game,
          session,
          eventBuffer,
          clock,
        );

        if (!promoted) {
          await this.reevaluateGameStatusAfterParticipantLoss(
            game,
            session,
            eventBuffer,
            clock,
          );
        }

        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.PARTICIPANT_REMOVED,
              actorId: hostObjectId,
              payload: { targetUserId: targetObjectId, reason },
              createdAt: now,
            },
          ],
          { session },
        );

        eventBuffer.buffer({
          type: GameEventTypes.PARTICIPANT_REMOVED,
          gameId: game._id.toString(),
          actorId: hostObjectId.toString(),
          timestamp: now,
          data: { targetUserId: targetObjectId.toString(), reason },
        });
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
  }
}
