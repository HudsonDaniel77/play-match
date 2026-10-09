import { Types } from 'mongoose';
import { Rating } from '../models/rating.model.js';
import { Sport } from '../models/sport.model.js';
import { Profile } from '../models/profile.model.js';
import { config } from '../config/index.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { NotFoundError, ValidationError } from '../utils/app-error.js';
import { resolveBandLabel } from '../engine/rating/index.js';
import { RatingVisibility, ProfileVisibility } from '../constants/visibility.js';

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  band: { key: string; label: string };
  gamesPlayed: number;
  provisional: boolean;
  wins: number;
  losses: number;
  draws: number;
}

export interface PaginatedLeaderboard {
  sportKey: string;
  sportName: string;
  entries: LeaderboardEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}

export class LeaderboardService {
  /**
   * Retrieves cursor-paginated leaderboard for a given sport.
   * Respects user visibility preferences and provisional filtering settings.
   */
  public async getSportLeaderboard(
    sportKey: string,
    cursor?: string,
    limit: number = config.LEADERBOARD_PAGE_SIZE_DEFAULT,
  ): Promise<PaginatedLeaderboard> {
    const sport = await Sport.findOne({ key: sportKey.toLowerCase().trim() });
    if (!sport) {
      throw new NotFoundError(Messages.SPORT_NOT_FOUND, ErrorCodes.SPORT_NOT_FOUND);
    }

    const pageSize = Math.min(
      Math.max(1, limit),
      config.LEADERBOARD_PAGE_SIZE_MAX,
    );

    // 1. Base query for Ratings
    const query: Record<string, unknown> = {
      sport: sport._id,
    };

    if (config.LEADERBOARD_EXCLUDE_PROVISIONAL) {
      query.gamesPlayed = { $gte: config.PROVISIONAL_GAMES_THRESHOLD };
    }

    // Cursor pagination (rating descending, _id ascending)
    if (cursor) {
      if (!Types.ObjectId.isValid(cursor)) {
        throw new ValidationError('Invalid cursor provided', ErrorCodes.VALIDATION_ERROR);
      }
      const cursorRating = await Rating.findById(cursor);
      if (cursorRating) {
        query.$or = [
          { rating: { $lt: cursorRating.rating } },
          { rating: cursorRating.rating, _id: { $gt: cursorRating._id } },
        ];
      }
    }

    const ratingDocs = await Rating.find(query)
      .sort({ rating: -1, _id: 1 })
      .limit(pageSize * 2 + 1); // fetch buffer to allow filtering private users

    // Find profiles for candidate users to check privacy
    const userIds = ratingDocs.map((r) => r.user);
    const profiles = await Profile.find({ user: { $in: userIds } });
    const profileMap = new Map<string, typeof profiles[0]>();
    for (const p of profiles) {
      profileMap.set(p.user.toString(), p);
    }

    const entries: LeaderboardEntry[] = [];
    let nextCursor: string | null = null;
    let hasMore = false;

    for (const r of ratingDocs) {
      const profile = profileMap.get(r.user.toString());

      // Privacy Check:
      // If user profile is PRIVATE or ratings visibility is HIDDEN, skip from public leaderboard
      if (
        profile &&
        (profile.visibility?.profile === ProfileVisibility.PRIVATE ||
          profile.visibility?.ratings === RatingVisibility.HIDDEN)
      ) {
        continue;
      }

      if (entries.length >= pageSize) {
        hasMore = true;
        nextCursor = entries[entries.length - 1].userId ? r.id : null;
        break;
      }

      const band = resolveBandLabel(r.rating, sport.skillBands || []);
      entries.push({
        userId: r.user.toString(),
        displayName: profile?.displayName || 'Anonymous Player',
        avatarUrl: profile?.avatarUrl || null,
        rating: r.rating,
        band,
        gamesPlayed: r.gamesPlayed,
        provisional: r.gamesPlayed < config.PROVISIONAL_GAMES_THRESHOLD,
        wins: r.wins || 0,
        losses: r.losses || 0,
        draws: r.draws || 0,
      });
    }

    return {
      sportKey: sport.key,
      sportName: sport.name,
      entries,
      hasMore,
      nextCursor,
    };
  }
}

export const leaderboardService = new LeaderboardService();
