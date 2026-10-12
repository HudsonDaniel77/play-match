import { Types } from 'mongoose';
import {
  Game,
  Profile,
  SportProfile,
  Rating,
  GameParticipant,
  PlayerReliability,
  Sport,
} from '../models/index.js';
import { GameStatuses, ParticipantStatuses } from '../constants/game-constants.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { HttpStatus } from '../constants/http-status.js';
import { AppError } from '../utils/app-error.js';
import { defaultClock, type Clock } from '../utils/clock.js';
import { VenueSuggestionService } from './venue-suggestion.service.js';
import { DiscoveryService } from './discovery.service.js';
import {
  evaluateGameRecommendation,
  type EvaluatedRecommendation,
  type RecommendationEvaluationInput,
} from '../engine/recommendation/index.js';
import type { GetRecommendationsQuery } from '../validators/recommendation.validators.js';
import { RECOMMENDATION_LIMITS } from '../constants/recommendation-constants.js';

export interface RecommendationsPayload {
  items: EvaluatedRecommendation[];
}

export class RecommendationService {
  static async getRecommendations(
    viewerId: Types.ObjectId | string,
    query: GetRecommendationsQuery,
    clock: Clock = defaultClock,
  ): Promise<RecommendationsPayload> {
    const callerObjectId =
      typeof viewerId === 'string' ? new Types.ObjectId(viewerId) : viewerId;

    // 1. Fetch caller profile
    const callerProfile = await Profile.findOne({ user: callerObjectId });
    if (!callerProfile) {
      throw new AppError(
        Messages.PROFILE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.PROFILE_NOT_FOUND,
      );
    }

    // 2. Map active sports & keys
    const sports = await Sport.find({ isActive: true }).lean();
    const sportIdToKey = new Map(sports.map((s) => [s._id.toString(), s.key]));

    // 3. Fetch caller's sports and ratings
    const sportProfiles = await SportProfile.find({
      user: callerObjectId,
      isActive: true,
    }).lean();

    const callerRatings = await Rating.find({ user: callerObjectId }).lean();
    const ratingsBySportKey = new Map<
      string,
      { rating: number; gamesPlayed: number }
    >();

    for (const r of callerRatings) {
      const sKey = sportIdToKey.get(r.sport.toString());
      if (sKey) {
        ratingsBySportKey.set(sKey, {
          rating: r.rating,
          gamesPlayed: r.gamesPlayed || 0,
        });
      }
    }

    // 4. Determine target sports
    let targetSportKeys: string[] = [];
    if (query.sportKey) {
      targetSportKeys = [query.sportKey];
    } else if (sportProfiles.length > 0) {
      targetSportKeys = sportProfiles
        .map((sp) => sportIdToKey.get(sp.sport.toString()))
        .filter((k): k is string => Boolean(k));
    } else {
      targetSportKeys = sports.map((s) => s.key);
    }

    // 5. Query candidate games
    const now = clock.now();
    const candidateGames = await Game.find({
      status: GameStatuses.OPEN,
      startsAt: { $gt: now },
      hostId: { $ne: callerObjectId },
      sportKey: { $in: targetSportKeys },
    }).lean();

    if (candidateGames.length === 0) {
      return { items: [] };
    }

    // 6. Exclude games caller is already involved in (joined, requested, waitlisted)
    const existingParticipations = await GameParticipant.find({
      userId: callerObjectId,
      gameId: { $in: candidateGames.map((g) => g._id) },
      status: {
        $in: [
          ParticipantStatuses.JOINED,
          ParticipantStatuses.REQUESTED,
          ParticipantStatuses.WAITLISTED,
        ],
      },
    }).select('gameId');

    const excludedGameIds = new Set(
      existingParticipations.map((p) => p.gameId.toString()),
    );

    // Caller coordinates & travel radius
    const callerCoords = callerProfile.homeLocation?.coordinates;
    const callerTravelRadiusKm =
      callerProfile.travelRadiusKm || RECOMMENDATION_LIMITS.DEFAULT_MAX_DISTANCE_KM;

    // Cache host reliabilities
    const hostIds = Array.from(
      new Set(candidateGames.map((g) => g.hostId.toString())),
    ).map((id) => new Types.ObjectId(id));

    const hostReliabilities = await PlayerReliability.find({
      userId: { $in: hostIds },
    }).lean();

    const hostReliabilityMap = new Map<string, number>();
    for (const rel of hostReliabilities) {
      hostReliabilityMap.set(rel.userId.toString(), rel.score);
    }

    const evaluations: Array<{
      evaluated: EvaluatedRecommendation;
      distanceKm: number;
    }> = [];

    for (const game of candidateGames) {
      const gIdStr = game._id.toString();
      if (excludedGameIds.has(gIdStr)) {
        continue;
      }

      // Check open seats
      const seatsLeft = (game.maxPlayers || 0) - (game.participantCount || 0);
      if (seatsLeft <= 0) {
        continue;
      }

      // Compute distance
      let distanceKm = 10;
      if (
        callerCoords &&
        callerCoords.length === 2 &&
        game.location?.coordinates &&
        game.location.coordinates.length === 2
      ) {
        const rawDist = VenueSuggestionService.haversineDistanceKm(
          callerCoords[0],
          callerCoords[1],
          game.location.coordinates[0],
          game.location.coordinates[1],
        );
        distanceKm = DiscoveryService.roundDistance(rawDist, Boolean(game.venue));
      }

      if (query.maxDistanceKm && distanceKm > query.maxDistanceKm) {
        continue;
      }

      // Compute rating gap & rating in range
      const callerRatingInfo = ratingsBySportKey.get(game.sportKey);
      const callerRating = callerRatingInfo?.rating ?? null;
      const gamesPlayed = callerRatingInfo?.gamesPlayed ?? 0;

      let ratingInRange = true;
      let ratingGap: number | null = null;

      if (game.ratingRange) {
        const { min, max, allowUnrated } = game.ratingRange;
        if (callerRating !== null) {
          ratingInRange = callerRating >= min && callerRating <= max;
          const targetMid = (min + max) / 2;
          ratingGap = Math.round(Math.abs(callerRating - targetMid));
        } else {
          ratingInRange = Boolean(allowUnrated);
        }
      } else if (callerRating !== null) {
        ratingGap = 0;
      }

      // Compute availability fit
      let availabilityFit = false;
      if (callerProfile.availability && callerProfile.availability.length > 0) {
        const gStart = new Date(game.startsAt);
        const dayOfWeek = gStart.getUTCDay();
        const startMinute = gStart.getUTCHours() * 60 + gStart.getUTCMinutes();
        const durationMin =
          (new Date(game.endsAt).getTime() - gStart.getTime()) / (60 * 1000);
        const endMinute = startMinute + durationMin;

        availabilityFit = callerProfile.availability.some(
          (slot) =>
            slot.dayOfWeek === dayOfWeek &&
            startMinute >= slot.startMinute &&
            endMinute <= slot.endMinute,
        );
      }

      // Host reliability
      const hostScore = hostReliabilityMap.get(game.hostId.toString()) ?? null;

      // Title
      const gameTitle =
        (game as any).title ||
        `${game.sportKey.charAt(0).toUpperCase() + game.sportKey.slice(1)} ${game.formatKey || 'Game'}`;

      const evalInput: RecommendationEvaluationInput = {
        gameId: gIdStr,
        sportKey: game.sportKey,
        title: gameTitle,
        distanceKm,
        travelRadiusKm: callerTravelRadiusKm,
        ratingGap,
        ratingInRange,
        playerGamesPlayed: gamesPlayed,
        availabilityFit,
        hostReliabilityScore: hostScore,
        seatsLeft,
        totalSeats: game.maxPlayers || 10,
      };

      const evaluated = evaluateGameRecommendation(evalInput);

      if (query.minScore && evaluated.score < query.minScore) {
        continue;
      }

      evaluations.push({
        evaluated,
        distanceKm,
      });
    }

    // Sort by recommendation score DESC, then distanceKm ASC
    evaluations.sort((a, b) => {
      if (b.evaluated.score !== a.evaluated.score) {
        return b.evaluated.score - a.evaluated.score;
      }
      return a.distanceKm - b.distanceKm;
    });

    const limit = query.limit || RECOMMENDATION_LIMITS.DEFAULT_LIMIT;
    const sliced = evaluations.slice(0, limit).map((e) => e.evaluated);

    return { items: sliced };
  }
}
