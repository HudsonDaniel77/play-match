import mongoose, { Types } from 'mongoose';
import { Game } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { GameFeedback, type IGameFeedbackDocument } from '../models/game-feedback.model.js';
import {
  PlayerReliability,
  type IPlayerReliabilityDocument,
} from '../models/player-reliability.model.js';
import { Profile } from '../models/profile.model.js';
import {
  GameStatuses,
  ParticipantStatuses,
  LeaveTypes,
} from '../constants/game-constants.js';
import {
  AttendanceStatuses,
  ReliabilityEventTypes,
  type AttendanceStatus,
  type ReliabilityTier,
} from '../constants/reliability-constants.js';
import { ProfileVisibility, RatingVisibility } from '../constants/visibility.js';
import {
  computeReliabilityScore,
  type ReliabilityCounters,
  type ReliabilityScoringConfig,
} from '../engine/reliability/index.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import { TransactionEventBuffer } from '../utils/domain-events.js';

export interface SubmitFeedbackDTO {
  targetUserId: string;
  attendance: AttendanceStatus;
  note?: string;
}

/** Shape agreed in docs/future-feature-contracts.md (reliability section). */
export interface ReliabilitySummary {
  score: number;
  tier: ReliabilityTier;
  gamesCounted: number;
  onTimeLeaves: number;
  lateLeaves: number;
  noShows: number;
}

export interface ReliabilityResponse {
  userId: string;
  reliability: ReliabilitySummary;
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

function scoringConfig(): ReliabilityScoringConfig {
  return {
    priorGames: config.RELIABILITY_PRIOR_GAMES,
    creditOnTimeLeave: config.RELIABILITY_CREDIT_ON_TIME_LEAVE,
    creditLateLeave: config.RELIABILITY_CREDIT_LATE_LEAVE,
    creditNoShow: config.RELIABILITY_CREDIT_NO_SHOW,
    minGamesForTopTiers: config.RELIABILITY_MIN_GAMES_FOR_TOP_TIERS,
    tierSilverMin: config.RELIABILITY_TIER_SILVER_MIN,
    tierGoldMin: config.RELIABILITY_TIER_GOLD_MIN,
    tierPlatinumMin: config.RELIABILITY_TIER_PLATINUM_MIN,
  };
}

export class ReliabilityService {
  /**
   * Host records attendance for a joined player after the game is completed.
   * Recomputes the target's reliability snapshot afterwards.
   */
  static async submitFeedback(
    gameId: Types.ObjectId | string,
    reporterId: Types.ObjectId | string,
    dto: SubmitFeedbackDTO,
    clock: Clock = defaultClock,
  ): Promise<IGameFeedbackDocument> {
    const gId = toObjectId(gameId);
    const reporterObjectId = toObjectId(reporterId);
    const targetObjectId = toObjectId(dto.targetUserId);

    const game = await Game.findById(gId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    if (game.hostId.toString() !== reporterObjectId.toString()) {
      throw new AppError(
        Messages.FEEDBACK.HOST_ONLY,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    if (game.status !== GameStatuses.COMPLETED) {
      throw new AppError(
        Messages.FEEDBACK.GAME_NOT_COMPLETED,
        HttpStatus.CONFLICT,
        ErrorCodes.FEEDBACK_GAME_NOT_COMPLETED,
      );
    }

    const now = clock.now();
    const windowEnd = new Date(
      game.endsAt.getTime() + config.FEEDBACK_WINDOW_HOURS * 60 * 60 * 1000,
    );
    if (now > windowEnd) {
      throw new AppError(
        Messages.FEEDBACK.WINDOW_CLOSED,
        HttpStatus.CONFLICT,
        ErrorCodes.FEEDBACK_WINDOW_CLOSED,
      );
    }

    if (targetObjectId.toString() === reporterObjectId.toString()) {
      throw new AppError(
        Messages.FEEDBACK.INVALID_TARGET,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.FEEDBACK_INVALID_TARGET,
      );
    }

    const targetParticipation = await GameParticipant.findOne({
      gameId: gId,
      userId: targetObjectId,
      status: ParticipantStatuses.JOINED,
    });
    if (!targetParticipation) {
      throw new AppError(
        Messages.FEEDBACK.INVALID_TARGET,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.FEEDBACK_INVALID_TARGET,
      );
    }

    const existing = await GameFeedback.findOne({ gameId: gId, targetUserId: targetObjectId });
    if (existing) {
      throw new AppError(
        Messages.FEEDBACK.ALREADY_SUBMITTED,
        HttpStatus.CONFLICT,
        ErrorCodes.FEEDBACK_ALREADY_SUBMITTED,
      );
    }

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    let saved: IGameFeedbackDocument;

    try {
      await session.withTransaction(async () => {
        const [created] = await GameFeedback.create(
          [
            {
              gameId: gId,
              reporterUserId: reporterObjectId,
              targetUserId: targetObjectId,
              attendance: dto.attendance,
              note: dto.note,
            },
          ],
          { session },
        );
        saved = created;

        eventBuffer.buffer({
          type: ReliabilityEventTypes.FEEDBACK_SUBMITTED,
          gameId: gId.toString(),
          actorId: reporterObjectId.toString(),
          timestamp: now,
          data: {
            gameId: gId.toString(),
            reporterUserId: reporterObjectId.toString(),
            targetUserId: targetObjectId.toString(),
            attendance: dto.attendance,
          },
        });
      });
    } catch (err: unknown) {
      // Race: a concurrent request inserted the same (game, target) pair first
      if ((err as { code?: number })?.code === 11000) {
        throw new AppError(
          Messages.FEEDBACK.ALREADY_SUBMITTED,
          HttpStatus.CONFLICT,
          ErrorCodes.FEEDBACK_ALREADY_SUBMITTED,
        );
      }
      throw err;
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();

    await ReliabilityService.recomputeForUser(targetObjectId, clock);
    return saved!;
  }

  /**
   * Feedback entries for a game. The host sees everything; other joined
   * participants only see feedback recorded about themselves.
   */
  static async listGameFeedback(
    gameId: Types.ObjectId | string,
    requesterId: Types.ObjectId | string,
  ): Promise<IGameFeedbackDocument[]> {
    const gId = toObjectId(gameId);
    const requesterObjectId = toObjectId(requesterId);

    const game = await Game.findById(gId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const isHost = game.hostId.toString() === requesterObjectId.toString();
    if (!isHost) {
      const participation = await GameParticipant.findOne({
        gameId: gId,
        userId: requesterObjectId,
        status: ParticipantStatuses.JOINED,
      });
      if (!participation) {
        throw new AppError(
          Messages.FEEDBACK.NOT_PARTICIPANT,
          HttpStatus.FORBIDDEN,
          ErrorCodes.AUTH_FORBIDDEN,
        );
      }
    }

    const filter = isHost ? { gameId: gId } : { gameId: gId, targetUserId: requesterObjectId };
    return GameFeedback.find(filter).sort({ createdAt: 1 });
  }

  /**
   * Reliability for a player. Players always see their own; other players'
   * reliability respects the profile's privacy settings.
   */
  static async getReliability(
    targetUserId: Types.ObjectId | string,
    requesterId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<ReliabilityResponse> {
    const targetObjectId = toObjectId(targetUserId);
    const requesterObjectId = toObjectId(requesterId);

    if (targetObjectId.toString() !== requesterObjectId.toString()) {
      const profile = await Profile.findOne({ user: targetObjectId });
      if (!profile) {
        throw new AppError(
          Messages.RELIABILITY.PROFILE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          ErrorCodes.PROFILE_NOT_FOUND,
        );
      }
      if (
        profile.visibility?.profile === ProfileVisibility.PRIVATE ||
        profile.visibility?.ratings === RatingVisibility.HIDDEN
      ) {
        throw new AppError(
          Messages.RELIABILITY.PRIVATE,
          HttpStatus.FORBIDDEN,
          ErrorCodes.PROFILE_PRIVATE,
        );
      }
    }

    const snapshot = await ReliabilityService.recomputeForUser(targetObjectId, clock);
    return ReliabilityService.toResponse(snapshot);
  }

  /**
   * Derives counters from source-of-truth collections and refreshes the snapshot.
   * Idempotent: running it any number of times yields the same result.
   */
  static async recomputeForUser(
    userId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<IPlayerReliabilityDocument> {
    const uId = toObjectId(userId);
    const counters = await ReliabilityService.computeCounters(uId);
    const result = computeReliabilityScore(counters, scoringConfig());

    const snapshot = await PlayerReliability.findOneAndUpdate(
      { userId: uId },
      {
        $set: {
          userId: uId,
          score: result.score,
          tier: result.tier,
          gamesCounted: result.gamesCounted,
          attendedGames: counters.attendedGames,
          onTimeLeaves: counters.onTimeLeaves,
          lateLeaves: counters.lateLeaves,
          noShows: counters.noShows,
          lastComputedAt: clock.now(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return snapshot!;
  }

  static async computeCounters(userId: Types.ObjectId): Promise<ReliabilityCounters> {
    const [onTimeLeaves, lateLeaves, noShows, joinedParticipations] = await Promise.all([
      GameParticipant.countDocuments({
        userId,
        status: ParticipantStatuses.LEFT,
        leaveType: LeaveTypes.ON_TIME,
      }),
      GameParticipant.countDocuments({
        userId,
        status: ParticipantStatuses.LEFT,
        leaveType: LeaveTypes.LATE,
      }),
      GameFeedback.countDocuments({
        targetUserId: userId,
        attendance: AttendanceStatuses.NO_SHOW,
      }),
      GameParticipant.find({ userId, status: ParticipantStatuses.JOINED }).select('gameId'),
    ]);

    let completedJoinedGames = 0;
    if (joinedParticipations.length > 0) {
      completedJoinedGames = await Game.countDocuments({
        _id: { $in: joinedParticipations.map((p) => p.gameId) },
        status: GameStatuses.COMPLETED,
      });
    }

    // A reported no-show was a joined player of a completed game, so it is not an attended game
    const attendedGames = Math.max(0, completedJoinedGames - noShows);

    return { attendedGames, onTimeLeaves, lateLeaves, noShows };
  }

  private static toResponse(snapshot: IPlayerReliabilityDocument): ReliabilityResponse {
    return {
      userId: snapshot.userId.toString(),
      reliability: {
        score: snapshot.score,
        tier: snapshot.tier,
        gamesCounted: snapshot.gamesCounted,
        onTimeLeaves: snapshot.onTimeLeaves,
        lateLeaves: snapshot.lateLeaves,
        noShows: snapshot.noShows,
      },
    };
  }
}
