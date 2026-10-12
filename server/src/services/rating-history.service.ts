import { Types } from 'mongoose';
import { Rating } from '../models/rating.model.js';
import { Sport } from '../models/sport.model.js';
import { RatingEvent, type IRatingEventDocument } from '../models/rating-event.model.js';
import { config } from '../config/index.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { NotFoundError, ValidationError } from '../utils/app-error.js';
import {
  calculateConfidence,
  resolveBandLabel,
  buildRatingExplanation,
  type StructuredExplanation,
} from '../engine/rating/index.js';

export interface MyRatingView {
  sportKey: string;
  sportName: string;
  rating: number;
  band: { key: string; label: string };
  provisional: boolean;
  confidence: number;
  peakRating: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  lastRatedAt: Date | null;
}

export interface PaginatedEventHistory {
  events: IRatingEventDocument[];
  hasMore: boolean;
  nextCursor: string | null;
}

export class RatingHistoryService {
  /**
   * Retrieves all ratings for the authenticated user across configured sports.
   */
  public async getMyRatings(userId: string): Promise<MyRatingView[]> {
    const ratings = await Rating.find({ user: new Types.ObjectId(userId) }).populate<{
      sport: { key: string; name: string; skillBands: Array<{ key: string; label: string; order: number; seedRating: number }> };
    }>('sport');

    const now = new Date();
    const result: MyRatingView[] = [];

    for (const r of ratings) {
      if (!r.sport) continue;

      const bands = r.sport.skillBands || [];
      const currentBand = resolveBandLabel(r.rating, bands);
      const confidence = calculateConfidence(
        r.gamesPlayed,
        r.lastRatedAt,
        now,
        config.CONFIDENCE_GAMES_THRESHOLD,
        config.CONFIDENCE_RECENCY_HALF_LIFE_DAYS,
      );

      result.push({
        sportKey: r.sport.key,
        sportName: r.sport.name,
        rating: r.rating,
        band: currentBand,
        provisional: r.gamesPlayed < config.PROVISIONAL_GAMES_THRESHOLD,
        confidence,
        peakRating: r.peakRating ?? r.rating,
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
        draws: r.draws ?? 0,
        gamesPlayed: r.gamesPlayed,
        lastRatedAt: r.lastRatedAt ?? null,
      });
    }

    return result;
  }

  /**
   * Retrieves cursor-paginated ledger events for a specific sport, newest first.
   */
  public async getMySportHistory(
    userId: string,
    sportKey: string,
    cursor?: string,
    limit: number = config.HISTORY_PAGE_SIZE_DEFAULT,
  ): Promise<PaginatedEventHistory> {
    const sport = await Sport.findOne({ key: sportKey.toLowerCase().trim() });
    if (!sport) {
      throw new NotFoundError(Messages.SPORT_NOT_FOUND, ErrorCodes.SPORT_NOT_FOUND);
    }

    const pageSize = Math.min(
      Math.max(1, limit),
      config.HISTORY_PAGE_SIZE_MAX,
    );

    const query: Record<string, unknown> = {
      user: new Types.ObjectId(userId),
      sport: sport._id,
    };

    if (cursor) {
      if (!Types.ObjectId.isValid(cursor)) {
        throw new ValidationError('Invalid cursor provided', ErrorCodes.VALIDATION_ERROR);
      }
      const cursorEvent = await RatingEvent.findById(cursor);
      if (cursorEvent) {
        query.createdAt = { $lt: cursorEvent.createdAt };
      }
    }

    const events = await RatingEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(pageSize + 1);

    const hasMore = events.length > pageSize;
    const paginatedEvents = hasMore ? events.slice(0, pageSize) : events;
    const nextCursor = hasMore
      ? paginatedEvents[paginatedEvents.length - 1].id
      : null;

    return {
      events: paginatedEvents,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Generates structured explanation and plain-language interpretation for a specific ledger event.
   * Restricted to events belonging to the requesting user.
   */
  public async getEventExplanation(
    userId: string,
    sportKey: string,
    eventId: string,
  ): Promise<StructuredExplanation> {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new NotFoundError(Messages.NOT_FOUND, ErrorCodes.NOT_FOUND);
    }

    const sport = await Sport.findOne({ key: sportKey.toLowerCase().trim() });
    if (!sport) {
      throw new NotFoundError(Messages.SPORT_NOT_FOUND, ErrorCodes.SPORT_NOT_FOUND);
    }

    const event = await RatingEvent.findOne({
      _id: new Types.ObjectId(eventId),
      sport: sport._id,
      user: new Types.ObjectId(userId), // strictly enforces ownership!
    });

    if (!event) {
      throw new NotFoundError(
        Messages.RATING_EVENT_NOT_FOUND,
        ErrorCodes.RATING_EVENT_NOT_FOUND,
      );
    }

    return buildRatingExplanation({
      oldRating: event.oldRating,
      newRating: event.newRating,
      delta: event.delta,
      expectedScore: event.expectedScore,
      outcomeScore: event.outcomeScore,
      ownTeamRating: event.ownTeamRating,
      opponentTeamRating: event.opponentTeamRating,
      kUsed: event.kUsed,
      kBaseTier: event.kBaseTier,
      inactivityMultiplier: event.inactivityMultiplier,
      movMultiplier: event.movMultiplier,
      gamesPlayedBefore: event.gamesPlayedBefore,
      bandBefore: event.bandBefore,
      bandAfter: event.bandAfter,
    });
  }
}

export const ratingHistoryService = new RatingHistoryService();
