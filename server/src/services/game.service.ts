import mongoose, { Types } from 'mongoose';
import { Game, type IGameDocument } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { GameEvent } from '../models/game-event.model.js';
import { Sport } from '../models/sport.model.js';
import { Rating } from '../models/rating.model.js';
import { SportProfile } from '../models/sport-profile.model.js';
import { config } from '../config/index.js';
import {
  GameStatuses,
  JoinPolicies,
  GameVisibilities,
  ParticipantRoles,
  ParticipantStatuses,
  CancellationReasonCodes,
  GameEventTypes,
  type GameStatus,
  type JoinPolicy,
  type GameVisibility,
  type CancellationReasonCode,
} from '../constants/game-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import { TransactionEventBuffer } from '../utils/domain-events.js';
import { transitionGame } from './game-transition.service.js';
import { generateRandomAlphaNumeric } from '../utils/crypto.js';

export interface CreateGameInput {
  sportKey: string;
  formatKey: string;
  startsAt: Date;
  endsAt: Date;
  location: {
    type: 'Point';
    coordinates: [number, number];
    addressName?: string;
  };
  courtName?: string;
  joinPolicy?: JoinPolicy;
  visibility?: GameVisibility;
  ratingRange?: {
    min: number;
    max: number;
    allowUnrated?: boolean;
  };
  notes?: string;
}

export interface UpdateGameInput {
  formatKey?: string;
  startsAt?: Date;
  endsAt?: Date;
  location?: {
    type: 'Point';
    coordinates: [number, number];
    addressName?: string;
  };
  courtName?: string;
  notes?: string;
  joinPolicy?: JoinPolicy;
  visibility?: GameVisibility;
  ratingRange?: {
    min: number;
    max: number;
    allowUnrated?: boolean;
  };
}

export interface CancelGameInput {
  reasonCode: CancellationReasonCode;
  reasonText?: string;
}

export class GameService {
  /**
   * Helper to coarsen location if the viewer is not the host or a joined player
   */
  static async formatGameForViewer(game: any, viewerId?: string | Types.ObjectId): Promise<any> {
    const gameObj = typeof game.toObject === 'function' ? game.toObject() : { ...game };
    const vIdStr = viewerId ? viewerId.toString() : null;
    const hostIdStr = gameObj.hostId ? gameObj.hostId.toString() : null;

    const isHost = Boolean(vIdStr && hostIdStr && vIdStr === hostIdStr);
    let isJoined = false;

    if (vIdStr && !isHost) {
      if (gameObj.participants && Array.isArray(gameObj.participants)) {
        isJoined = gameObj.participants.some(
          (p: any) =>
            p.userId?.toString() === vIdStr && p.status === ParticipantStatuses.JOINED,
        );
      } else {
        const p = await GameParticipant.findOne({
          gameId: gameObj.id || gameObj._id,
          userId: new Types.ObjectId(vIdStr),
          status: ParticipantStatuses.JOINED,
        });
        isJoined = Boolean(p);
      }
    }

    if (!isHost && !isJoined && gameObj.location && gameObj.location.coordinates) {
      const precision = config.LOCATION_PUBLIC_PRECISION_DECIMALS;
      const factor = Math.pow(10, precision);
      gameObj.location = {
        type: 'Point',
        coordinates: [
          Math.round(gameObj.location.coordinates[0] * factor) / factor,
          Math.round(gameObj.location.coordinates[1] * factor) / factor,
        ],
        // Omit addressName for coarsen privacy
      };
      delete gameObj.courtName;
    }

    return gameObj;
  }

  static async createGame(
    hostId: Types.ObjectId | string,
    input: CreateGameInput,
    clock: Clock = defaultClock,
  ): Promise<IGameDocument> {
    const hostObjectId = typeof hostId === 'string' ? new Types.ObjectId(hostId) : hostId;
    const now = clock.now();

    // 1. Validate startsAt timing
    const minLeadTime = new Date(
      now.getTime() + config.GAME_CREATION_LEAD_TIME_MINUTES * 60 * 1000,
    );
    if (input.startsAt < minLeadTime) {
      throw new AppError(
        Messages.GAMES.STARTS_AT_TOO_SOON,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.GAME_TIME_INVALID,
      );
    }

    const maxAdvanceTime = new Date(
      now.getTime() + config.GAME_MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000,
    );
    if (input.startsAt > maxAdvanceTime) {
      throw new AppError(
        Messages.GAMES.STARTS_AT_TOO_FAR,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.GAME_TIME_INVALID,
      );
    }

    // 2. Validate duration
    const durationMinutes = (input.endsAt.getTime() - input.startsAt.getTime()) / (60 * 1000);
    if (
      durationMinutes < config.GAME_MIN_DURATION_MINUTES ||
      durationMinutes > config.GAME_MAX_DURATION_MINUTES
    ) {
      throw new AppError(
        Messages.GAMES.DURATION_INVALID,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.GAME_TIME_INVALID,
      );
    }

    // 3. Validate sport & format
    const sport = await Sport.findOne({ key: input.sportKey, isActive: true });
    if (!sport) {
      throw new AppError(
        Messages.GAMES.SPORT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.SPORT_NOT_FOUND,
      );
    }

    const format = sport.formats.find((f) => f.key === input.formatKey);
    if (!format) {
      throw new AppError(
        Messages.GAMES.FORMAT_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.GAME_FORMAT_INVALID,
      );
    }

    const maxPlayers = 2 * format.playersPerSide;
    const minPlayers = sport.minPlayers || 2;

    // 4. Validate host has sport profile
    const hostSportProfile = await SportProfile.findOne({
      user: hostObjectId,
      sport: sport._id,
      isActive: true,
    });
    if (!hostSportProfile) {
      throw new AppError(
        Messages.GAMES.SPORT_NOT_IN_PROFILE,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.GAME_SPORT_NOT_IN_PROFILE,
      );
    }

    // 5. Check host rating if ratingRange specified
    const hostRatingDoc = await Rating.findOne({
      user: hostObjectId,
      sport: sport._id,
    });
    const hostRating = hostRatingDoc ? hostRatingDoc.rating : undefined;

    if (input.ratingRange) {
      if (input.ratingRange.min > input.ratingRange.max) {
        throw new AppError(
          Messages.GAMES.RATING_RANGE_INVALID,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.VALIDATION_ERROR,
        );
      }
      if (hostRating !== undefined) {
        if (hostRating < input.ratingRange.min || hostRating > input.ratingRange.max) {
          throw new AppError(
            Messages.GAMES.OUTSIDE_RATING_RANGE,
            HttpStatus.BAD_REQUEST,
            ErrorCodes.GAME_OUTSIDE_RATING_RANGE,
          );
        }
      } else if (!input.ratingRange.allowUnrated) {
        throw new AppError(
          Messages.GAMES.OUTSIDE_RATING_RANGE,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.GAME_OUTSIDE_RATING_RANGE,
        );
      }
    }

    // 6. Check host schedule conflicts
    const conflict = await GameParticipant.findOne({
      userId: hostObjectId,
      status: ParticipantStatuses.JOINED,
      startsAt: { $lt: input.endsAt },
      endsAt: { $gt: input.startsAt },
    });
    if (conflict) {
      throw new AppError(
        Messages.GAMES.SCHEDULE_CONFLICT,
        HttpStatus.CONFLICT,
        ErrorCodes.GAME_SCHEDULE_CONFLICT,
      );
    }

    // Generate invite code for private games
    const visibility = input.visibility || GameVisibilities.PUBLIC;
    let inviteCode: string | undefined;
    if (visibility === GameVisibilities.PRIVATE) {
      inviteCode = generateRandomAlphaNumeric(config.INVITE_CODE_LENGTH).toUpperCase();
    }

    // Run creation inside transaction
    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    let createdGame: IGameDocument;

    try {
      await session.withTransaction(async () => {
        const [game] = await Game.create(
          [
            {
              hostId: hostObjectId,
              sportKey: input.sportKey,
              formatKey: input.formatKey,
              status: GameStatuses.OPEN,
              joinPolicy: input.joinPolicy || JoinPolicies.OPEN,
              visibility,
              inviteCode,
              minPlayers,
              maxPlayers,
              participantCount: 1, // Host auto-joins
              waitlistCount: 0,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              location: input.location,
              courtName: input.courtName,
              ratingRange: input.ratingRange
                ? {
                    min: input.ratingRange.min,
                    max: input.ratingRange.max,
                    allowUnrated:
                      input.ratingRange.allowUnrated ??
                      config.RATING_ALLOW_UNRATED_DEFAULT,
                  }
                : undefined,
              notes: input.notes,
              statusHistory: [
                {
                  fromStatus: null,
                  toStatus: GameStatuses.OPEN,
                  changedAt: now,
                  changedBy: hostObjectId,
                  reason: 'Game created',
                },
              ],
            },
          ],
          { session },
        );

        createdGame = game;

        // Auto-join host as HOST
        await GameParticipant.create(
          [
            {
              gameId: game._id,
              userId: hostObjectId,
              role: ParticipantRoles.HOST,
              status: ParticipantStatuses.JOINED,
              joinedAt: now,
              userRatingAtJoin: hostRating,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
            },
          ],
          { session },
        );

        // Record GameEvent
        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.GAME_CREATED,
              actorId: hostObjectId,
              payload: {
                sportKey: game.sportKey,
                formatKey: game.formatKey,
                startsAt: game.startsAt,
                endsAt: game.endsAt,
              },
              createdAt: now,
            },
          ],
          { session },
        );

        eventBuffer.buffer({
          type: GameEventTypes.GAME_CREATED,
          gameId: game._id.toString(),
          actorId: hostObjectId.toString(),
          timestamp: now,
          data: {
            sportKey: game.sportKey,
            formatKey: game.formatKey,
          },
        });
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
    return createdGame!;
  }

  static async getGameById(
    gameId: Types.ObjectId | string,
    viewerId?: Types.ObjectId | string,
  ): Promise<any> {
    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    // Check private game access: only host or joined participant can view without code
    if (game.visibility === GameVisibilities.PRIVATE) {
      const vIdStr = viewerId ? viewerId.toString() : null;
      const isHost = vIdStr && game.hostId.toString() === vIdStr;
      if (!isHost) {
        const participant = vIdStr
          ? await GameParticipant.findOne({
              gameId: game._id,
              userId: new Types.ObjectId(vIdStr),
              status: {
                $in: [
                  ParticipantStatuses.JOINED,
                  ParticipantStatuses.REQUESTED,
                  ParticipantStatuses.WAITLISTED,
                ],
              },
            })
          : null;

        if (!participant) {
          throw new AppError(
            Messages.GAMES.NOT_FOUND,
            HttpStatus.NOT_FOUND,
            ErrorCodes.GAME_NOT_FOUND,
          );
        }
      }
    }

    return await this.formatGameForViewer(game, viewerId);
  }

  static async getGameByInviteCode(
    inviteCode: string,
    viewerId?: Types.ObjectId | string,
  ): Promise<any> {
    const game = await Game.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!game) {
      throw new AppError(
        Messages.GAMES.INVALID_INVITE_CODE,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    // Returning game details before joining MUST coarsen the location (Requirement 9)
    return await this.formatGameForViewer(game, viewerId);
  }

  static async updateGame(
    gameId: Types.ObjectId | string,
    actorId: Types.ObjectId | string,
    input: UpdateGameInput,
    clock: Clock = defaultClock,
  ): Promise<IGameDocument> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const now = clock.now();

    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    if (game.hostId.toString() !== actorObjectId.toString()) {
      throw new AppError(
        Messages.GAMES.FORBIDDEN_OPERATION,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    if (
      game.status === GameStatuses.IN_PROGRESS ||
      game.status === GameStatuses.COMPLETED ||
      game.status === GameStatuses.CANCELLED ||
      game.status === GameStatuses.EXPIRED
    ) {
      throw new AppError(
        Messages.GAMES.GAME_LOCKED,
        HttpStatus.CONFLICT,
        ErrorCodes.GAME_STATUS_INVALID,
      );
    }

    // Rules for editing CONFIRMED games or games with other joined players:
    // Format cannot be changed after another player joins or when confirmed
    const hasOtherParticipants = game.participantCount > 1;

    if (input.formatKey && input.formatKey !== game.formatKey) {
      if (hasOtherParticipants || game.status === GameStatuses.CONFIRMED) {
        throw new AppError(
          Messages.GAMES.GAME_LOCKED,
          HttpStatus.CONFLICT,
          ErrorCodes.GAME_LOCKED,
        );
      }
      const sport = await Sport.findOne({ key: game.sportKey, isActive: true });
      const format = sport?.formats.find((f) => f.key === input.formatKey);
      if (!format) {
        throw new AppError(
          Messages.GAMES.FORMAT_NOT_FOUND,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.GAME_FORMAT_INVALID,
        );
      }
      game.formatKey = input.formatKey;
      game.maxPlayers = 2 * format.playersPerSide;
    }

    let timeChanged = false;
    if (input.startsAt || input.endsAt) {
      if (game.status === GameStatuses.CONFIRMED) {
        throw new AppError(
          Messages.GAMES.GAME_LOCKED,
          HttpStatus.CONFLICT,
          ErrorCodes.GAME_LOCKED,
        );
      }
      const newStartsAt = input.startsAt || game.startsAt;
      const newEndsAt = input.endsAt || game.endsAt;

      const durationMinutes = (newEndsAt.getTime() - newStartsAt.getTime()) / (60 * 1000);
      if (
        durationMinutes < config.GAME_MIN_DURATION_MINUTES ||
        durationMinutes > config.GAME_MAX_DURATION_MINUTES
      ) {
        throw new AppError(
          Messages.GAMES.DURATION_INVALID,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.GAME_TIME_INVALID,
        );
      }

      game.startsAt = newStartsAt;
      game.endsAt = newEndsAt;
      timeChanged = true;
    }

    if (input.location) {
      if (game.status === GameStatuses.CONFIRMED && hasOtherParticipants) {
        throw new AppError(
          Messages.GAMES.GAME_LOCKED,
          HttpStatus.CONFLICT,
          ErrorCodes.GAME_LOCKED,
        );
      }
      game.location = input.location;
    }

    if (input.courtName !== undefined) game.courtName = input.courtName;
    if (input.notes !== undefined) game.notes = input.notes;
    if (input.joinPolicy !== undefined) game.joinPolicy = input.joinPolicy;
    if (input.visibility !== undefined) game.visibility = input.visibility;
    if (input.ratingRange !== undefined) {
      game.ratingRange = {
        min: input.ratingRange.min,
        max: input.ratingRange.max,
        allowUnrated:
          input.ratingRange.allowUnrated ?? config.RATING_ALLOW_UNRATED_DEFAULT,
      };
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await game.save({ session });

        // If time changed, update denormalized startsAt/endsAt in all participants
        if (timeChanged) {
          await GameParticipant.updateMany(
            { gameId: game._id },
            { $set: { startsAt: game.startsAt, endsAt: game.endsAt } },
            { session },
          );
        }

        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.GAME_EDITED,
              actorId: actorObjectId,
              payload: input,
              createdAt: now,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return game;
  }

  static async cancelGame(
    gameId: Types.ObjectId | string,
    actorId: Types.ObjectId | string,
    input: CancelGameInput,
    actorRole: 'host' | 'admin' = 'host',
    clock: Clock = defaultClock,
  ): Promise<IGameDocument> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const now = clock.now();

    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const isHost = game.hostId.toString() === actorObjectId.toString();
    const isAdmin = actorRole === 'admin';

    if (!isHost && !isAdmin) {
      throw new AppError(
        Messages.GAMES.FORBIDDEN_OPERATION,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    if (
      game.status === GameStatuses.CANCELLED ||
      game.status === GameStatuses.COMPLETED ||
      game.status === GameStatuses.EXPIRED
    ) {
      throw new AppError(
        Messages.GAMES.ALREADY_TERMINAL,
        HttpStatus.CONFLICT,
        ErrorCodes.GAME_STATUS_INVALID,
      );
    }

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();

    try {
      await session.withTransaction(async () => {
        game.cancellation = {
          reasonCode: input.reasonCode,
          reasonText: input.reasonText,
          cancelledAt: now,
          cancelledBy: actorObjectId,
        };

        await transitionGame(game, {
          toStatus: GameStatuses.CANCELLED,
          actorId: actorObjectId,
          actorRole: isAdmin && !isHost ? 'admin' : 'host',
          reason: input.reasonText || input.reasonCode,
          session,
          eventBuffer,
          clock,
          extraEventPayload: {
            reasonCode: input.reasonCode,
            reasonText: input.reasonText,
          },
        });
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
    return game;
  }
}
