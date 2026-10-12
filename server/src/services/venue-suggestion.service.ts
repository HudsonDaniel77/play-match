import { Types } from 'mongoose';
import { Game } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { Profile } from '../models/profile.model.js';
import { Venue } from '../models/venue.model.js';
import { config } from '../config/index.js';
import { ParticipantStatuses } from '../constants/game-constants.js';
import {
  VenueStatuses,
  VenueSuggestionReasons,
  type VenueSuggestionReason,
} from '../constants/venue-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { type Clock, defaultClock } from '../utils/clock.js';

export interface VenueSuggestionAggregate {
  venue: {
    id: string;
    name: string;
    areaLabel: string;
    address: any;
    location: any;
  };
  totalDistanceKm: number;
  averageDistanceKm: number;
  maxDistanceKm: number;
  participantsCounted: number;
  availableAtTime: boolean;
  reasons: VenueSuggestionReason[];
}

export class VenueSuggestionService {
  /**
   * Great-Circle distance formula (Haversine) in km
   */
  static haversineDistanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static async getVenueSuggestions(
    gameId: Types.ObjectId | string,
    hostId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<VenueSuggestionAggregate[]> {
    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError('Game not found', HttpStatus.NOT_FOUND, ErrorCodes.GAME_NOT_FOUND);
    }

    if (game.hostId.toString() !== hostId.toString()) {
      throw new AppError('Only the game host can request venue suggestions', HttpStatus.FORBIDDEN, ErrorCodes.AUTH_FORBIDDEN);
    }

    // 1. Get joined participants EXCLUDING the host (Requirement 4)
    const participations = await GameParticipant.find({
      gameId: game._id,
      status: ParticipantStatuses.JOINED,
      userId: { $ne: game.hostId },
    });

    const userIds = participations.map((p) => p.userId);
    const profiles = await Profile.find({ user: { $in: userIds } });

    // Include only participants whose visibility settings allow it and have a saved home location (Requirement 4)
    const validCoords: Array<[number, number]> = [];
    for (const prof of profiles) {
      if (
        prof.visibility &&
        prof.visibility.location !== 'hidden' &&
        prof.homeLocation &&
        prof.homeLocation.coordinates &&
        prof.homeLocation.coordinates.length === 2
      ) {
        validCoords.push(prof.homeLocation.coordinates as [number, number]);
      }
    }

    if (validCoords.length < config.MIN_PARTICIPANTS_FOR_VENUE_SUGGESTION) {
      throw new AppError(
        `At least ${config.MIN_PARTICIPANTS_FOR_VENUE_SUGGESTION} non-host participants with visible locations are required to generate venue suggestions`,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INSUFFICIENT_PARTICIPANTS_FOR_SUGGESTION,
      );
    }

    // 2. Compute group centroid internally (never returned to client)
    let sumLon = 0;
    let sumLat = 0;
    for (const [lon, lat] of validCoords) {
      sumLon += lon;
      sumLat += lat;
    }
    const centroidLon = sumLon / validCoords.length;
    const centroidLat = sumLat / validCoords.length;

    // 3. Find candidate active venues supporting the sport within radius of centroid
    const candidateVenues = await Venue.find({
      status: VenueStatuses.ACTIVE,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [centroidLon, centroidLat] },
          $maxDistance: config.VENUE_SUGGESTION_RADIUS_KM * 1000,
        },
      },
      'courts.sportKeys': game.sportKey,
      'courts.isActive': true,
    }).limit(config.VENUE_SUGGESTION_MAX_RESULTS * 3);

    const step = config.DISTANCE_PRIVACY_ROUNDING_KM;
    const roundDist = (val: number) => Math.round(val / step) * step;

    const suggestions: VenueSuggestionAggregate[] = [];

    for (const v of candidateVenues) {
      const vLon = v.location.coordinates[0];
      const vLat = v.location.coordinates[1];

      let totalDist = 0;
      let maxDist = 0;

      for (const [pLon, pLat] of validCoords) {
        const d = this.haversineDistanceKm(pLon, pLat, vLon, vLat);
        totalDist += d;
        if (d > maxDist) maxDist = d;
      }

      const avgDist = totalDist / validCoords.length;

      // Check availability for game's time range
      const dayOfWeek = game.startsAt.getUTCDay();
      const startMin = game.startsAt.getUTCHours() * 60 + game.startsAt.getUTCMinutes();
      const endMin = game.endsAt.getUTCHours() * 60 + game.endsAt.getUTCMinutes();

      const fitsHours = v.weeklyHours && v.weeklyHours.some(
        (h) => h.dayOfWeek === dayOfWeek && startMin >= h.openMinute && endMin <= h.closeMinute,
      );
      const isClosed = v.closures && v.closures.some(
        (c) => game.startsAt < c.endsAt && game.endsAt > c.startsAt,
      );
      const availableAtTime = Boolean(fitsHours && !isClosed);

      const reasons: VenueSuggestionReason[] = [VenueSuggestionReasons.SUPPORTS_SPORT];
      if (availableAtTime) reasons.push(VenueSuggestionReasons.AVAILABLE_AT_TIME);

      suggestions.push({
        venue: {
          id: v._id.toString(),
          name: v.name,
          areaLabel: v.areaLabel,
          address: v.address,
          location: v.location,
        },
        totalDistanceKm: roundDist(totalDist),
        averageDistanceKm: roundDist(avgDist),
        maxDistanceKm: roundDist(maxDist),
        participantsCounted: validCoords.length,
        availableAtTime,
        reasons,
      });
    }

    // 4. Transparent Ranking Rule (Requirement 4):
    // Primary: Lowest averageDistanceKm
    // Tie-breaker: Lowest maxDistanceKm
    // Secondary tie-breaker: venue.id ascending
    suggestions.sort((a, b) => {
      if (a.averageDistanceKm !== b.averageDistanceKm) {
        return a.averageDistanceKm - b.averageDistanceKm;
      }
      if (a.maxDistanceKm !== b.maxDistanceKm) {
        return a.maxDistanceKm - b.maxDistanceKm;
      }
      return a.venue.id.localeCompare(b.venue.id);
    });

    if (suggestions.length > 0) {
      suggestions[0]!.reasons.push(VenueSuggestionReasons.CLOSEST_TO_GROUP);
    }

    return suggestions.slice(0, config.VENUE_SUGGESTION_MAX_RESULTS);
  }
}
