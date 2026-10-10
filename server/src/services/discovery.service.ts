import mongoose, { Types } from 'mongoose';
import { Game } from '../models/game.model.js';
import { Venue } from '../models/venue.model.js';
import { Profile } from '../models/profile.model.js';
import { Rating } from '../models/rating.model.js';
import { Sport } from '../models/sport.model.js';
import { checkEligibility } from './game-eligibility.service.js';
import { config } from '../config/index.js';
import {
  GameStatuses,
  GameVisibilities,
} from '../constants/game-constants.js';
import {
  DiscoverySortOptions,
  type DiscoverySortOption,
  VenueStatuses,
} from '../constants/venue-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import { GameService } from './game.service.js';

export interface DiscoverGamesFilter {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sportKey?: string;
  formatKey?: string;
  startsAfter?: Date;
  startsBefore?: Date;
  joinPolicy?: string;
  venueId?: string;
  openSeatsOnly?: boolean;
  hideMine?: boolean;
  ratingEligibleOnly?: boolean;
  sortBy?: DiscoverySortOption;
  limit?: number;
  cursor?: string;
  explain?: boolean;
}

export interface MatchSignals {
  distanceKm: number;
  ratingGap: number | null;
  ratingInRange: boolean;
  availabilityFit: boolean;
  travelRadiusFit: boolean;
  hostRating: number | null;
  seatsLeft: number;
}

export interface DiscoveredGameItem {
  game: any;
  distanceKm: number;
  matchSignals: MatchSignals;
  eligibilityExplanation?: any;
}

export interface DiscoverGamesResult {
  items: DiscoveredGameItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    totalReturned: number;
  };
}

export class DiscoveryService {
  /**
   * Helper to round distance for free-form games to prevent triangulation (Requirement 1, 2, 5)
   */
  static roundDistance(distanceKm: number, isVenue: boolean): number {
    if (isVenue) return Math.round(distanceKm * 100) / 100; // exact 2 decimals
    const step = config.DISTANCE_PRIVACY_ROUNDING_KM;
    return Math.round(distanceKm / step) * step;
  }

  /**
   * Encodes keyset cursor (Requirement 1: never contains exact distance for free-form)
   */
  static encodeCursor(sortKey: 'distance' | 'start_time', val: number | string, id: string): string {
    return Buffer.from(JSON.stringify({ k: sortKey, v: val, id })).toString('base64');
  }

  static decodeCursor(cursorStr: string): { k: 'distance' | 'start_time'; v: any; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(cursorStr, 'base64').toString('utf8'));
      if (!parsed.k || parsed.v === undefined || !parsed.id) {
        throw new Error('Malformed cursor structure');
      }
      return parsed;
    } catch {
      throw new AppError('Invalid discovery cursor provided', HttpStatus.BAD_REQUEST, ErrorCodes.INVALID_DISCOVERY_CURSOR);
    }
  }

  static async discoverGames(
    callerId: Types.ObjectId | string,
    filters: DiscoverGamesFilter,
    clock: Clock = defaultClock,
  ): Promise<DiscoverGamesResult> {
    const callerObjectId = typeof callerId === 'string' ? new Types.ObjectId(callerId) : callerId;
    const now = clock.now();

    // 1. Resolve origin coordinates
    let originLng = filters.lng;
    let originLat = filters.lat;

    const callerProfile = await Profile.findOne({ user: callerObjectId });

    if (originLng === undefined || originLat === undefined) {
      if (
        callerProfile &&
        callerProfile.homeLocation &&
        callerProfile.homeLocation.coordinates &&
        callerProfile.homeLocation.coordinates.length === 2
      ) {
        originLng = callerProfile.homeLocation.coordinates[0];
        originLat = callerProfile.homeLocation.coordinates[1];
      } else {
        throw new AppError(
          'Origin latitude and longitude must be provided or configured in profile',
          HttpStatus.BAD_REQUEST,
          ErrorCodes.VALIDATION_ERROR,
        );
      }
    }

    // 2. Validate & clamp radius
    const rawRadius = filters.radiusKm ?? config.DISCOVERY_DEFAULT_RADIUS_KM;
    const clampedRadiusKm = Math.min(
      Math.max(rawRadius, config.DISCOVERY_MIN_RADIUS_KM),
      config.DISCOVERY_MAX_RADIUS_KM,
    );
    const radiusMeters = clampedRadiusKm * 1000;

    const pageSize = Math.min(
      filters.limit ?? config.DISCOVERY_PAGE_SIZE_DEFAULT,
      config.DISCOVERY_PAGE_SIZE_MAX,
    );

    // 3. Keyset cursor parsing
    let cursorObj: { k: string; v: any; id: string } | null = null;
    if (filters.cursor) {
      cursorObj = this.decodeCursor(filters.cursor);
    }

    const sortBy = filters.sortBy || DiscoverySortOptions.DISTANCE;

    // 4. Build aggregation pipeline
    const pipeline: any[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [originLng, originLat] },
          distanceField: 'exactDistanceMeters',
          maxDistance: radiusMeters * 1.5, // allow margin for rounded distance filtering
          spherical: true,
          query: {
            visibility: GameVisibilities.PUBLIC,
            status: { $in: [GameStatuses.OPEN, GameStatuses.FULL] },
            startsAt: {
              $gte: filters.startsAfter ?? now,
              ...(filters.startsBefore ? { $lte: filters.startsBefore } : {}),
            },
          },
        },
      },
    ];

    // Filter by sport/format/joinPolicy/venue if specified
    const matchStage: any = {};
    if (filters.sportKey) matchStage.sportKey = filters.sportKey;
    if (filters.formatKey) matchStage.formatKey = filters.formatKey;
    if (filters.joinPolicy) matchStage.joinPolicy = filters.joinPolicy;
    if (filters.venueId) matchStage.venue = new Types.ObjectId(filters.venueId);

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Execute aggregation query to get raw candidate pool
    const candidates = await Game.aggregate(pipeline);

    // Caller ratings for sports
    const callerRatings = await Rating.find({ user: callerObjectId });
    const ratingBySportId = new Map<string, number>();
    for (const r of callerRatings) {
      ratingBySportId.set(r.sport.toString(), r.rating);
    }

    // Cache sportKey → sport ObjectId to avoid redundant DB lookups
    const sportKeyToIdMap = new Map<string, string>();

    // Filter and compute displayed distance and match signals in memory
    const processed: DiscoveredGameItem[] = [];

    for (const rawGame of candidates) {
      const isVenue = Boolean(rawGame.venue);
      const exactDistanceKm = rawGame.exactDistanceMeters / 1000;
      const displayedDistanceKm = this.roundDistance(exactDistanceKm, isVenue);

      // Requirement 2: Apply radius filter to rounded distance for free-form games
      if (displayedDistanceKm > clampedRadiusKm) {
        continue;
      }

      // Hide mine check
      if (filters.hideMine && rawGame.hostId.toString() === callerObjectId.toString()) {
        continue;
      }

      // Open seats only filter
      const seatsLeft = rawGame.maxPlayers - rawGame.participantCount;
      if (filters.openSeatsOnly && seatsLeft <= 0) {
        continue;
      }

      // Resolve sport ObjectId for this game's sportKey (cached)
      if (rawGame.sportKey && !sportKeyToIdMap.has(rawGame.sportKey)) {
        const sportDoc = await Sport.findOne({ key: rawGame.sportKey }).lean();
        if (sportDoc) sportKeyToIdMap.set(rawGame.sportKey, sportDoc._id.toString());
      }
      const sportId = rawGame.sportKey ? sportKeyToIdMap.get(rawGame.sportKey) : undefined;

      // Caller rating for this sport (from pre-built map)
      let callerRatingVal: number | null = null;
      if (sportId) callerRatingVal = ratingBySportId.get(sportId) ?? null;

      // Rating fit check
      let ratingInRange = true;
      let ratingGap: number | null = null;
      if (rawGame.ratingRange) {
        const { min, max, allowUnrated } = rawGame.ratingRange;
        if (callerRatingVal !== null) {
          ratingInRange = callerRatingVal >= min && callerRatingVal <= max;
          const midpoint = (min + max) / 2;
          ratingGap = Math.round((callerRatingVal - midpoint) * 10) / 10;
        } else {
          ratingInRange = Boolean(allowUnrated);
        }
      }

      if (filters.ratingEligibleOnly && !ratingInRange) {
        continue;
      }

      // Host rating (use resolved sportId from sportKeyToIdMap)
      let hostRatingVal: number | null = null;
      if (sportId) {
        const hostRatingDoc = await Rating.findOne({
          user: rawGame.hostId,
          sport: new Types.ObjectId(sportId),
        });
        if (hostRatingDoc) hostRatingVal = hostRatingDoc.rating;
      }

      // Travel radius fit (Requirement 2: applied to displayed distance for free-form)
      const callerTravelRadius = callerProfile?.travelRadiusKm ?? config.DISCOVERY_DEFAULT_RADIUS_KM;
      const travelRadiusFit = displayedDistanceKm <= callerTravelRadius;

      // Availability fit
      let availabilityFit = false;
      if (callerProfile?.availability && callerProfile.availability.length > 0) {
        const gStart = new Date(rawGame.startsAt);
        const dayOfWeek = gStart.getUTCDay();
        const startMinute = gStart.getUTCHours() * 60 + gStart.getUTCMinutes();
        const endMinute = startMinute + (new Date(rawGame.endsAt).getTime() - gStart.getTime()) / (60 * 1000);

        availabilityFit = callerProfile.availability.some(
          (slot) => slot.dayOfWeek === dayOfWeek && startMinute >= slot.startMinute && endMinute <= slot.endMinute,
        );
      }

      const matchSignals: MatchSignals = {
        distanceKm: displayedDistanceKm,
        ratingGap,
        ratingInRange,
        availabilityFit,
        travelRadiusFit,
        hostRating: hostRatingVal,
        seatsLeft,
      };

      const formattedGame = await GameService.formatGameForViewer(rawGame, callerObjectId);

      processed.push({
        game: formattedGame,
        distanceKm: displayedDistanceKm,
        matchSignals,
      });
    }

    // 5. Stable Sort (Requirement 1 & 8)
    if (sortBy === DiscoverySortOptions.DISTANCE) {
      processed.sort((a, b) => {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        const idA = String(a.game.id || a.game._id || '');
        const idB = String(b.game.id || b.game._id || '');
        return idA.localeCompare(idB);
      });
    } else {
      // START_TIME
      processed.sort((a, b) => {
        const tA = new Date(a.game.startsAt).getTime();
        const tB = new Date(b.game.startsAt).getTime();
        if (tA !== tB) return tA - tB;
        const idA = String(a.game.id || a.game._id || '');
        const idB = String(b.game.id || b.game._id || '');
        return idA.localeCompare(idB);
      });
    }

    // 6. Apply keyset cursor
    let startIndex = 0;
    if (cursorObj) {
      const idx = processed.findIndex((item) => {
        const itemId = String(item.game.id || item.game._id || '');
        if (cursorObj!.k === 'distance') {
          if (item.distanceKm > cursorObj!.v) return true;
          if (item.distanceKm === cursorObj!.v && itemId > cursorObj!.id) return true;
          return false;
        } else {
          const itemTime = new Date(item.game.startsAt).toISOString();
          if (itemTime > cursorObj!.v) return true;
          if (itemTime === cursorObj!.v && itemId > cursorObj!.id) return true;
          return false;
        }
      });
      startIndex = idx !== -1 ? idx : processed.length;
    }

    const pageItems = processed.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < processed.length;

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1]!;
      const lastItemId = String(lastItem.game.id || lastItem.game._id || '');
      if (sortBy === DiscoverySortOptions.DISTANCE) {
        nextCursor = this.encodeCursor('distance', lastItem.distanceKm, lastItemId);
      } else {
        nextCursor = this.encodeCursor('start_time', new Date(lastItem.game.startsAt).toISOString(), lastItemId);
      }
    }

    // 7. Capped Eligibility Explainability (at most DISCOVERY_MAX_ELIGIBILITY_EXPLAIN_PER_PAGE)
    if (filters.explain) {
      const explainCount = Math.min(pageItems.length, config.DISCOVERY_MAX_ELIGIBILITY_EXPLAIN_PER_PAGE);
      for (let i = 0; i < explainCount; i++) {
        const item = pageItems[i]!;
        const gameDoc = await Game.findById(item.game.id);
        if (gameDoc) {
          const elig = await checkEligibility(callerObjectId, gameDoc);
          item.eligibilityExplanation = elig;
        }
      }
    }

    return {
      items: pageItems,
      pagination: {
        hasMore,
        nextCursor,
        totalReturned: pageItems.length,
      },
    };
  }
}
