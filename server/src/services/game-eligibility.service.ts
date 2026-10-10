import { Types } from 'mongoose';
import { type IGameDocument } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { SportProfile } from '../models/sport-profile.model.js';
import { Rating } from '../models/rating.model.js';
import { Sport } from '../models/sport.model.js';
import { config } from '../config/index.js';
import {
  EligibilityReasonCodes,
  GameStatuses,
  ParticipantStatuses,
  type EligibilityReasonCode,
} from '../constants/game-constants.js';
import { type Clock, defaultClock } from '../utils/clock.js';

export interface EligibilityResult {
  eligible: boolean;
  reasons: EligibilityReasonCode[];
  userRating?: number;
}

export async function checkEligibility(
  userId: Types.ObjectId | string,
  game: IGameDocument,
  clock: Clock = defaultClock,
): Promise<EligibilityResult> {
  const reasons: EligibilityReasonCode[] = [];
  const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const now = clock.now();

  // 1. Check if user already joined, requested, or waitlisted
  const existingActive = await GameParticipant.findOne({
    gameId: game._id,
    userId: uid,
    status: {
      $in: [
        ParticipantStatuses.JOINED,
        ParticipantStatuses.REQUESTED,
        ParticipantStatuses.WAITLISTED,
      ],
    },
  });

  if (existingActive) {
    reasons.push(EligibilityReasonCodes.ALREADY_PARTICIPANT);
  }

  // 2. Check game status
  if (game.status !== GameStatuses.OPEN && game.status !== GameStatuses.FULL) {
    reasons.push(EligibilityReasonCodes.GAME_NOT_OPEN);
  }

  // 3. Check join cutoff
  const cutoffTime = new Date(
    game.startsAt.getTime() - config.JOIN_CUTOFF_MINUTES_BEFORE_START * 60 * 1000,
  );
  if (now >= cutoffTime) {
    reasons.push(EligibilityReasonCodes.PAST_JOIN_CUTOFF);
  }

  // 4. Check user has sport configured in profile
  const sport = await Sport.findOne({ key: game.sportKey, isActive: true });
  if (!sport) {
    reasons.push(EligibilityReasonCodes.SPORT_NOT_IN_PROFILE);
    return { eligible: false, reasons };
  }

  const sportProf = await SportProfile.findOne({
    user: uid,
    sport: sport._id,
    isActive: true,
  });

  if (!sportProf) {
    reasons.push(EligibilityReasonCodes.SPORT_NOT_IN_PROFILE);
  }

  // 5. Fetch user rating for rating range verification
  let userRating: number | undefined;
  const ratingDoc = await Rating.findOne({
    user: uid,
    sport: sport._id,
  });
  if (ratingDoc) {
    userRating = ratingDoc.rating;
  }

  if (game.ratingRange) {
    const { min, max, allowUnrated } = game.ratingRange;
    if (userRating === undefined) {
      if (!allowUnrated) {
        reasons.push(EligibilityReasonCodes.OUTSIDE_RATING_RANGE);
      }
    } else {
      if (userRating < min || userRating > max) {
        reasons.push(EligibilityReasonCodes.OUTSIDE_RATING_RANGE);
      }
    }
  }

  // 6. Check for schedule conflicts
  // A conflict exists if user has another 'joined' participation whose interval overlaps [game.startsAt, game.endsAt]
  // Excluding the current game
  const conflict = await GameParticipant.findOne({
    userId: uid,
    gameId: { $ne: game._id },
    status: ParticipantStatuses.JOINED,
    startsAt: { $lt: game.endsAt },
    endsAt: { $gt: game.startsAt },
  });

  if (conflict) {
    reasons.push(EligibilityReasonCodes.SCHEDULE_CONFLICT);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    userRating,
  };
}
