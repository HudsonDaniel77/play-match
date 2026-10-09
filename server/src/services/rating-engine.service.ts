import mongoose, { Types } from 'mongoose';
import { Sport, type ISportDocument } from '../models/sport.model.js';
import { Rating, type IRatingDocument } from '../models/rating.model.js';
import { MatchResult, type IMatchResultDocument } from '../models/match-result.model.js';
import { RatingEvent } from '../models/rating-event.model.js';
import { config } from '../config/index.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { MatchOutcomes, type MatchOutcome } from '../constants/match-outcomes.js';
import { MatchStatuses } from '../constants/match-status.js';
import { MatchSourceTypes, type MatchSourceType } from '../constants/match-sources.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
import {
  calculateMatchRatings,
  type MatchSideInput,
  type PlayerDeltaCalculation,
  type SkillBandDefinition,
} from '../engine/rating/index.js';

export interface ApplyMatchSideDTO {
  sideKey: string;
  playerIds: string[];
  score: number;
}

export interface ApplyMatchResultDTO {
  sportKey: string;
  source: {
    type: MatchSourceType;
    id: string;
  };
  sides: ApplyMatchSideDTO[];
}

export interface ApplyMatchResultResponse {
  matchResultId: string;
  outcome: MatchOutcome;
  appliedAt: Date;
  status: string;
  participants: Array<{
    userId: string;
    sideKey: string;
    oldRating: number;
    newRating: number;
    delta: number;
    expectedScore: number;
    bandAfter: { key: string; label: string };
  }>;
}

export interface PreviewMatchDTO {
  sportKey: string;
  sides: Array<{
    sideKey: string;
    playerIds: string[];
  }>;
}

export interface PreviewMatchResponse {
  sportKey: string;
  sideA: {
    sideKey: string;
    teamRating: number;
    winProbabilityPercent: number;
  };
  sideB: {
    sideKey: string;
    teamRating: number;
    winProbabilityPercent: number;
  };
  callerHypotheticalDeltas?: {
    win: number;
    draw: number;
    loss: number;
  };
}

export class RatingEngineService {
  /**
   * Applies a verified match result, updating player ratings atomically and writing to the append-only ledger.
   * Guaranteed idempotent across multiple submissions of the same source.
   */
  public async applyMatchResult(
    dto: ApplyMatchResultDTO,
    recordedByUserId: string,
  ): Promise<ApplyMatchResultResponse> {
    const sport = await this.validateAndFetchSport(dto.sportKey);

    // 1. Validate structure and player constraints
    this.validateMatchSides(dto.sides, sport);

    // 2. Check for existing applied result (Idempotency check)
    const existingResult = await MatchResult.findOne({
      sport: sport._id,
      'source.type': dto.source.type,
      'source.id': dto.source.id,
    });

    if (existingResult) {
      logger.info(
        { source: dto.source, matchResultId: existingResult._id },
        'Match result already applied. Returning idempotent outcome.',
      );
      const events = await RatingEvent.find({ matchResult: existingResult._id });
      return {
        matchResultId: existingResult.id,
        outcome: existingResult.outcome,
        appliedAt: existingResult.appliedAt,
        status: existingResult.status,
        participants: events.map((e) => ({
          userId: e.user.toString(),
          sideKey: dto.sides.find((s) => s.playerIds.includes(e.user.toString()))?.sideKey || '',
          oldRating: e.oldRating,
          newRating: e.newRating,
          delta: e.delta,
          expectedScore: e.expectedScore,
          bandAfter: e.bandAfter,
        })),
      };
    }

    // 3. Retry loop for optimistic concurrency
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        return await this.executeTransaction(dto, sport, recordedByUserId);
      } catch (err: unknown) {
        if (
          err instanceof ConflictError ||
          (err instanceof Error && err.message.includes('WriteConflict'))
        ) {
          logger.warn(
            { attempt, source: dto.source },
            'Optimistic concurrency collision detected. Retrying transaction...',
          );
          if (attempt >= maxRetries) {
            throw new ConflictError(
              'Concurrent match update collision. Please retry submission.',
              ErrorCodes.CONCURRENT_MODIFICATION_ERROR,
            );
          }
          // Exponential backoff wait
          await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(2, attempt)));
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError(
      'Transaction failed after maximum retry attempts',
      ErrorCodes.CONCURRENT_MODIFICATION_ERROR,
    );
  }

  /**
   * Internal transactional execution
   */
  private async executeTransaction(
    dto: ApplyMatchResultDTO,
    sport: ISportDocument,
    recordedByUserId: string,
  ): Promise<ApplyMatchResultResponse> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const allPlayerIds = [
        ...dto.sides[0].playerIds,
        ...dto.sides[1].playerIds,
      ];

      // Fetch all participant ratings within transaction
      const ratingDocs = await Rating.find({
        sport: sport._id,
        user: { $in: allPlayerIds.map((id) => new Types.ObjectId(id)) },
      }).session(session);

      if (ratingDocs.length !== allPlayerIds.length) {
        throw new ValidationError(
          Messages.PLAYER_RATING_NOT_FOUND,
          ErrorCodes.PLAYER_RATING_NOT_FOUND,
        );
      }

      const ratingMap = new Map<string, IRatingDocument>();
      for (const r of ratingDocs) {
        ratingMap.set(r.user.toString(), r);
      }

      // Prepare inputs for pure rating engine
      const sideAInput: MatchSideInput = {
        sideKey: dto.sides[0].sideKey,
        score: dto.sides[0].score,
        players: dto.sides[0].playerIds.map((id) => {
          const doc = ratingMap.get(id)!;
          return {
            userId: id,
            rating: doc.rating,
            gamesPlayed: doc.gamesPlayed,
            lastRatedAt: doc.lastRatedAt,
          };
        }),
      };

      const sideBInput: MatchSideInput = {
        sideKey: dto.sides[1].sideKey,
        score: dto.sides[1].score,
        players: dto.sides[1].playerIds.map((id) => {
          const doc = ratingMap.get(id)!;
          return {
            userId: id,
            rating: doc.rating,
            gamesPlayed: doc.gamesPlayed,
            lastRatedAt: doc.lastRatedAt,
          };
        }),
      };

      // Determine outcome
      let outcome: MatchOutcome = MatchOutcomes.DRAW;
      if (dto.sides[0].score > dto.sides[1].score) {
        outcome = MatchOutcomes.SIDE_A_WIN;
      } else if (dto.sides[0].score < dto.sides[1].score) {
        outcome = MatchOutcomes.SIDE_B_WIN;
      }

      // Check draw eligibility
      if (outcome === MatchOutcomes.DRAW && !sport.allowsDraws) {
        throw new ValidationError(
          Messages.DRAW_NOT_ALLOWED,
          ErrorCodes.DRAW_NOT_ALLOWED,
        );
      }

      const skillBands: SkillBandDefinition[] = sport.skillBands.map((b) => ({
        key: b.key,
        label: b.label,
        order: b.order,
        seedRating: b.seedRating,
      }));

      // Calculate deltas via pure engine
      const calculations: PlayerDeltaCalculation[] = calculateMatchRatings(
        sideAInput,
        sideBInput,
        {
          scaleDivisor: config.RATING_SCALE_DIVISOR,
          kTiers: config.RATING_K_TIERS,
          movEnabled: config.MOV_ENABLED,
          movWeight: config.MOV_WEIGHT,
          ratingMin: config.RATING_MIN,
          ratingMax: config.RATING_MAX,
          ratingDecimals: config.RATING_DECIMALS,
          inactivityDays: config.INACTIVITY_DAYS,
          inactivityKMultiplier: config.INACTIVITY_K_MULTIPLIER,
          confidenceGamesThreshold: config.CONFIDENCE_GAMES_THRESHOLD,
          confidenceRecencyHalfLifeDays: config.CONFIDENCE_RECENCY_HALF_LIFE_DAYS,
        },
        skillBands,
        config.TEAM_RATING_AGGREGATION,
      );

      // Create MatchResult document
      const matchResultDoc = new MatchResult({
        sport: sport._id,
        source: dto.source,
        sides: [
          {
            sideKey: dto.sides[0].sideKey,
            players: dto.sides[0].playerIds.map((id) => new Types.ObjectId(id)),
            score: dto.sides[0].score,
          },
          {
            sideKey: dto.sides[1].sideKey,
            players: dto.sides[1].playerIds.map((id) => new Types.ObjectId(id)),
            score: dto.sides[1].score,
          },
        ],
        outcome,
        status: MatchStatuses.APPLIED,
        appliedAt: new Date(),
        recordedBy: new Types.ObjectId(recordedByUserId),
      });

      await matchResultDoc.save({ session });

      // Save RatingEvents and update Ratings
      for (const calc of calculations) {
        const ratingDoc = ratingMap.get(calc.userId)!;

        // Create immutable ledger event
        const ratingEvent = new RatingEvent({
          user: new Types.ObjectId(calc.userId),
          sport: sport._id,
          matchResult: matchResultDoc._id,
          oldRating: calc.oldRating,
          newRating: calc.newRating,
          delta: calc.delta,
          expectedScore: calc.expectedScore,
          outcomeScore: calc.outcomeScore,
          ownTeamRating: calc.ownTeamRating,
          opponentTeamRating: calc.opponentTeamRating,
          kUsed: calc.kUsed,
          kBaseTier: calc.kBaseTier,
          inactivityMultiplier: calc.inactivityMultiplier,
          movMultiplier: calc.movMultiplier,
          gamesPlayedBefore: calc.gamesPlayedBefore,
          bandBefore: calc.bandBefore,
          bandAfter: calc.bandAfter,
          voided: false,
          createdAt: matchResultDoc.appliedAt,
        });

        await ratingEvent.save({ session });

        // Calculate W/L/D updates
        const isWin = calc.outcomeScore === 1.0;
        const isLoss = calc.outcomeScore === 0.0;
        const isDraw = calc.outcomeScore === 0.5;

        const updatedWins = (ratingDoc.wins || 0) + (isWin ? 1 : 0);
        const updatedLosses = (ratingDoc.losses || 0) + (isLoss ? 1 : 0);
        const updatedDraws = (ratingDoc.draws || 0) + (isDraw ? 1 : 0);
        const updatedPeakRating = Math.max(ratingDoc.peakRating || calc.oldRating, calc.newRating);

        // Optimistic locking update
        const updateResult = await Rating.updateOne(
          {
            _id: ratingDoc._id,
            gamesPlayed: ratingDoc.gamesPlayed, // optimistic version check
          },
          {
            $set: {
              rating: calc.newRating,
              gamesPlayed: ratingDoc.gamesPlayed + 1,
              peakRating: updatedPeakRating,
              wins: updatedWins,
              losses: updatedLosses,
              draws: updatedDraws,
              lastRatedAt: matchResultDoc.appliedAt,
            },
          },
          { session },
        );

        if (updateResult.matchedCount === 0) {
          throw new ConflictError(
            `Concurrent modification detected on player ${calc.userId}`,
            ErrorCodes.CONCURRENT_MODIFICATION_ERROR,
          );
        }
      }

      await session.commitTransaction();

      return {
        matchResultId: matchResultDoc.id,
        outcome: matchResultDoc.outcome,
        appliedAt: matchResultDoc.appliedAt,
        status: matchResultDoc.status,
        participants: calculations.map((c) => ({
          userId: c.userId,
          sideKey: c.sideKey,
          oldRating: c.oldRating,
          newRating: c.newRating,
          delta: c.delta,
          expectedScore: c.expectedScore,
          bandAfter: c.bandAfter,
        })),
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Voids an applied match result if and only if it is the latest rated match for all participants.
   */
  public async voidMatchResult(
    matchResultId: string,
    _adminUserId: string,
  ): Promise<{ matchResultId: string; status: string; voidedAt: Date }> {
    if (!Types.ObjectId.isValid(matchResultId)) {
      throw new ValidationError(Messages.NOT_FOUND, ErrorCodes.NOT_FOUND);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const matchResult = await MatchResult.findById(matchResultId).session(session);
      if (!matchResult) {
        throw new NotFoundError(
          Messages.MATCH_RESULT_NOT_FOUND,
          ErrorCodes.MATCH_RESULT_NOT_FOUND,
        );
      }

      if (matchResult.status === MatchStatuses.VOIDED) {
        throw new ValidationError(
          Messages.MATCH_RESULT_ALREADY_VOIDED,
          ErrorCodes.MATCH_RESULT_ALREADY_VOIDED,
        );
      }

      const events = await RatingEvent.find({
        matchResult: matchResult._id,
      }).session(session);

      // Verify that this match is the latest rated event for EVERY participant
      for (const event of events) {
        const newerEvent = await RatingEvent.findOne({
          user: event.user,
          sport: event.sport,
          createdAt: { $gt: event.createdAt },
          voided: false,
        }).session(session);

        if (newerEvent) {
          throw new ValidationError(
            Messages.CANNOT_VOID_HISTORIC_RESULT,
            ErrorCodes.CANNOT_VOID_HISTORIC_RESULT,
          );
        }
      }

      // Revert each participant's rating document
      for (const event of events) {
        const ratingDoc = await Rating.findOne({
          user: event.user,
          sport: event.sport,
        }).session(session);

        if (ratingDoc) {
          const isWin = event.outcomeScore === 1.0;
          const isLoss = event.outcomeScore === 0.0;
          const isDraw = event.outcomeScore === 0.5;

          // Find prior non-voided event to restore previous lastRatedAt and peak
          const priorEvent = await RatingEvent.findOne({
            user: event.user,
            sport: event.sport,
            _id: { $ne: event._id },
            voided: false,
            createdAt: { $lt: event.createdAt },
          })
            .sort({ createdAt: -1 })
            .session(session);

          ratingDoc.rating = event.oldRating;
          ratingDoc.gamesPlayed = Math.max(0, ratingDoc.gamesPlayed - 1);
          ratingDoc.wins = Math.max(0, (ratingDoc.wins || 0) - (isWin ? 1 : 0));
          ratingDoc.losses = Math.max(0, (ratingDoc.losses || 0) - (isLoss ? 1 : 0));
          ratingDoc.draws = Math.max(0, (ratingDoc.draws || 0) - (isDraw ? 1 : 0));
          ratingDoc.lastRatedAt = priorEvent ? priorEvent.createdAt : null;

          await ratingDoc.save({ session });
        }

        // Mark event voided
        event.voided = true;
        await event.save({ session });
      }

      matchResult.status = MatchStatuses.VOIDED;
      await matchResult.save({ session });

      await session.commitTransaction();

      return {
        matchResultId: matchResult.id,
        status: MatchStatuses.VOIDED,
        voidedAt: new Date(),
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Pure what-if match preview calculation. Writes nothing to database.
   */
  public async previewMatch(
    dto: PreviewMatchDTO,
    requestingUserId: string,
  ): Promise<PreviewMatchResponse> {
    const sport = await this.validateAndFetchSport(dto.sportKey);

    if (!dto.sides || dto.sides.length !== 2) {
      throw new ValidationError(
        Messages.INVALID_MATCH_SIDES,
        ErrorCodes.INVALID_MATCH_SIDES,
      );
    }

    const allPlayerIds = [...dto.sides[0].playerIds, ...dto.sides[1].playerIds];
    const uniqueIds = new Set(allPlayerIds);
    if (uniqueIds.size !== allPlayerIds.length) {
      throw new ValidationError(
        Messages.DUPLICATE_PLAYER_IN_MATCH,
        ErrorCodes.DUPLICATE_PLAYER_IN_MATCH,
      );
    }

    const ratingDocs = await Rating.find({
      sport: sport._id,
      user: { $in: allPlayerIds.map((id) => new Types.ObjectId(id)) },
    });

    if (ratingDocs.length !== allPlayerIds.length) {
      throw new ValidationError(
        Messages.PLAYER_RATING_NOT_FOUND,
        ErrorCodes.PLAYER_RATING_NOT_FOUND,
      );
    }

    const ratingMap = new Map<string, number>();
    for (const r of ratingDocs) {
      ratingMap.set(r.user.toString(), r.rating);
    }

    const ratingsA = dto.sides[0].playerIds.map((id) => ratingMap.get(id)!);
    const ratingsB = dto.sides[1].playerIds.map((id) => ratingMap.get(id)!);

    const teamRatingA = ratingsA.reduce((sum, r) => sum + r, 0) / ratingsA.length;
    const teamRatingB = ratingsB.reduce((sum, r) => sum + r, 0) / ratingsB.length;

    // Win probability from expected score
    const expScoreA = 1 / (1 + Math.pow(10, (teamRatingB - teamRatingA) / config.RATING_SCALE_DIVISOR));
    const expScoreB = 1 - expScoreA;

    const probA = Math.round(expScoreA * 1000) / 10;
    const probB = Math.round(expScoreB * 1000) / 10;

    let callerDeltas: { win: number; draw: number; loss: number } | undefined;
    if (uniqueIds.has(requestingUserId)) {
      const isCallerSideA = dto.sides[0].playerIds.includes(requestingUserId);
      const callerRatingDoc = ratingDocs.find((r) => r.user.toString() === requestingUserId)!;
      const oppTeamRating = isCallerSideA ? teamRatingB : teamRatingA;

      const callerExp = 1 / (1 + Math.pow(10, (oppTeamRating - callerRatingDoc.rating) / config.RATING_SCALE_DIVISOR));
      const kFactor = 32; // Standard preview baseline

      callerDeltas = {
        win: Math.round(kFactor * (1.0 - callerExp) * 10) / 10,
        draw: Math.round(kFactor * (0.5 - callerExp) * 10) / 10,
        loss: Math.round(kFactor * (0.0 - callerExp) * 10) / 10,
      };
    }

    return {
      sportKey: sport.key,
      sideA: {
        sideKey: dto.sides[0].sideKey,
        teamRating: Math.round(teamRatingA * 10) / 10,
        winProbabilityPercent: probA,
      },
      sideB: {
        sideKey: dto.sides[1].sideKey,
        teamRating: Math.round(teamRatingB * 10) / 10,
        winProbabilityPercent: probB,
      },
      callerHypotheticalDeltas: callerDeltas,
    };
  }

  private async validateAndFetchSport(sportKey: string): Promise<ISportDocument> {
    const sport = await Sport.findOne({ key: sportKey.toLowerCase().trim() });
    if (!sport) {
      throw new NotFoundError(Messages.SPORT_NOT_FOUND, ErrorCodes.SPORT_NOT_FOUND);
    }
    if (!sport.isActive) {
      throw new ValidationError(Messages.SPORT_INACTIVE, ErrorCodes.SPORT_INACTIVE);
    }
    return sport;
  }

  private validateMatchSides(sides: ApplyMatchSideDTO[], sport: ISportDocument): void {
    if (!sides || sides.length !== 2) {
      throw new ValidationError(
        Messages.INVALID_MATCH_SIDES,
        ErrorCodes.INVALID_MATCH_SIDES,
      );
    }

    const sideA = sides[0];
    const sideB = sides[1];

    if (!sideA.playerIds || !sideB.playerIds) {
      throw new ValidationError(
        Messages.INVALID_MATCH_SIDES,
        ErrorCodes.INVALID_MATCH_SIDES,
      );
    }

    const maxAllowed = sport.maxPlayers || config.MAX_PLAYERS_PER_SIDE_FALLBACK;
    const minAllowed = sport.minPlayers || 1;

    if (
      sideA.playerIds.length < minAllowed ||
      sideA.playerIds.length > maxAllowed ||
      sideB.playerIds.length < minAllowed ||
      sideB.playerIds.length > maxAllowed
    ) {
      throw new ValidationError(
        `Side size must be between ${minAllowed} and ${maxAllowed} players for ${sport.name}`,
        ErrorCodes.INVALID_MATCH_SIDES,
      );
    }

    if (sideA.score < 0 || sideB.score < 0) {
      throw new ValidationError(
        'Match scores must be non-negative integers',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // Check duplicate players within side or across sides
    const allPlayers = [...sideA.playerIds, ...sideB.playerIds];
    const uniquePlayers = new Set(allPlayers);
    if (uniquePlayers.size !== allPlayers.length) {
      throw new ValidationError(
        Messages.DUPLICATE_PLAYER_IN_MATCH,
        ErrorCodes.DUPLICATE_PLAYER_IN_MATCH,
      );
    }
  }
}

export const ratingEngineService = new RatingEngineService();
