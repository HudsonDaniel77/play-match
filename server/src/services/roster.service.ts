import { Types } from 'mongoose';
import { Game } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { User } from '../models/user.model.js';
import { Profile } from '../models/profile.model.js';
import { Rating } from '../models/rating.model.js';
import { Sport } from '../models/sport.model.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { ParticipantStatuses } from '../constants/game-constants.js';

export interface RosterMember {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: string;
  status: string;
  joinedAt?: Date;
  rating?: number;
}

export interface GameRoster {
  gameId: string;
  sportKey: string;
  formatKey: string;
  minPlayers: number;
  maxPlayers: number;
  participantCount: number;
  joined: RosterMember[];
  requested: RosterMember[];
  waitlisted: RosterMember[];
}

export async function getGameRoster(
  gameId: Types.ObjectId | string,
  viewerId?: Types.ObjectId | string,
): Promise<GameRoster> {
  const gId = typeof gameId === 'string' ? new Types.ObjectId(gameId) : gameId;
  const game = await Game.findById(gId);
  if (!game) {
    throw new AppError(
      Messages.GAMES.NOT_FOUND,
      HttpStatus.NOT_FOUND,
      ErrorCodes.GAME_NOT_FOUND,
    );
  }

  // Fetch active participants
  const participants = await GameParticipant.find({
    gameId: gId,
    status: {
      $in: [
        ParticipantStatuses.JOINED,
        ParticipantStatuses.REQUESTED,
        ParticipantStatuses.WAITLISTED,
      ],
    },
  }).sort({ joinedAt: 1, waitlistedAt: 1, requestedAt: 1 });

  const userIds = participants.map((p) => p.userId);
  const sport = await Sport.findOne({ key: game.sportKey, isActive: true });
  const profiles = await Profile.find({ user: { $in: userIds } });
  const ratings = sport
    ? await Rating.find({
        user: { $in: userIds },
        sport: sport._id,
      })
    : [];

  const profileMap = new Map(profiles.map((p) => [p.user.toString(), p]));
  const ratingMap = new Map(ratings.map((r) => [r.user.toString(), r.rating]));

  const joined: RosterMember[] = [];
  const requested: RosterMember[] = [];
  const waitlisted: RosterMember[] = [];

  const isHost = viewerId && game.hostId.toString() === viewerId.toString();

  for (const p of participants) {
    const uIdStr = p.userId.toString();
    const prof = profileMap.get(uIdStr);
    const member: RosterMember = {
      userId: uIdStr,
      name: prof?.displayName || 'Player',
      avatarUrl: prof?.avatarUrl,
      role: p.role,
      status: p.status,
      joinedAt: p.joinedAt,
      rating: ratingMap.get(uIdStr) ?? p.userRatingAtJoin,
    };

    if (p.status === ParticipantStatuses.JOINED) {
      joined.push(member);
    } else if (p.status === ParticipantStatuses.REQUESTED) {
      // Only host sees pending requests
      if (isHost) {
        requested.push(member);
      }
    } else if (p.status === ParticipantStatuses.WAITLISTED) {
      waitlisted.push(member);
    }
  }

  return {
    gameId: game._id.toString(),
    sportKey: game.sportKey,
    formatKey: game.formatKey,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    participantCount: game.participantCount,
    joined,
    requested,
    waitlisted,
  };
}
