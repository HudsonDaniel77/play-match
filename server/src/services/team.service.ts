import mongoose, { Types } from 'mongoose';
import { Game } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { GameEvent } from '../models/game-event.model.js';
import {
  GameTeamFormation,
  type ITeamFormationBalance,
  type ITeamFormationTeam,
} from '../models/game-team-formation.model.js';
import { Profile } from '../models/profile.model.js';
import { Rating } from '../models/rating.model.js';
import { Sport } from '../models/sport.model.js';
import { SportProfile } from '../models/sport-profile.model.js';
import { config } from '../config/index.js';
import {
  GameEventTypes,
  ParticipantStatuses,
} from '../constants/game-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import { TransactionEventBuffer } from '../utils/domain-events.js';
import {
  balanceTeamsSnakeDraft,
  type DraftPlayerInput,
} from '../engine/team/snake-draft-balancer.js';

export interface TeamSuggestionPayload {
  teams: ITeamFormationTeam[];
  balance: ITeamFormationBalance;
  reasons: string[];
}

export class TeamService {
  static toPayload(doc: {
    teams: ITeamFormationTeam[];
    balance: ITeamFormationBalance;
    reasons: string[];
  }): TeamSuggestionPayload {
    return {
      teams: doc.teams,
      balance: doc.balance,
      reasons: doc.reasons,
    };
  }

  private static assertCanFormTeams(joinedCount: number, minPlayers: number): void {
    if (joinedCount < minPlayers || joinedCount < 2 || joinedCount % 2 !== 0) {
      throw new AppError(
        Messages.TEAMS.INSUFFICIENT_PLAYERS,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INSUFFICIENT_PARTICIPANTS_FOR_SUGGESTION,
        { joinedCount, minPlayers },
      );
    }
  }

  private static async loadDraftPlayers(gameId: Types.ObjectId): Promise<{
    game: NonNullable<Awaited<ReturnType<typeof Game.findById>>>;
    draftPlayers: DraftPlayerInput[];
  }> {
    const game = await Game.findById(gameId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const participations = await GameParticipant.find({
      gameId: game._id,
      status: ParticipantStatuses.JOINED,
    }).sort({ joinedAt: 1 });

    TeamService.assertCanFormTeams(participations.length, game.minPlayers);

    const userIds = participations.map((p) => p.userId);
    const sport = await Sport.findOne({ key: game.sportKey, isActive: true });
    if (!sport) {
      throw new AppError(
        Messages.GAMES.SPORT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.SPORT_NOT_FOUND,
      );
    }

    const profiles = await Profile.find({ user: { $in: userIds } });
    const sportProfiles = await SportProfile.find({
      user: { $in: userIds },
      sport: sport._id,
      isActive: true,
    });
    const ratings = await Rating.find({
      user: { $in: userIds },
      sport: sport._id,
    });

    const profileMap = new Map(profiles.map((p) => [p.user.toString(), p]));
    const sportProfileMap = new Map(sportProfiles.map((sp) => [sp.user.toString(), sp]));
    const ratingMap = new Map(ratings.map((r) => [r.user.toString(), r.rating]));
    const participantMap = new Map(participations.map((p) => [p.userId.toString(), p]));

    const draftPlayers: DraftPlayerInput[] = participations.map((p) => {
      const uid = p.userId.toString();
      const profile = profileMap.get(uid);
      const sportProfile = sportProfileMap.get(uid);
      const trackedRating = ratingMap.get(uid);
      const ratingAtJoin = participantMap.get(uid)?.userRatingAtJoin;
      const rating =
        trackedRating ??
        ratingAtJoin ??
        config.DEFAULT_SEED_RATING;

      const preferred = sportProfile?.preferredPositions?.[0];
      const player: DraftPlayerInput = {
        userId: uid,
        displayName: profile?.displayName ?? 'Player',
        rating,
      };
      if (preferred) {
        player.position = preferred;
      }
      return player;
    });

    return { game, draftPlayers };
  }

  static async generateTeams(
    gameId: Types.ObjectId | string,
    actorId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<TeamSuggestionPayload> {
    const gId = typeof gameId === 'string' ? new Types.ObjectId(gameId) : gameId;
    const actorObjectId =
      typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;

    const game = await Game.findById(gId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    if (game.hostId.toString() !== actorObjectId.toString()) {
      throw new AppError(
        Messages.TEAMS.HOST_ONLY_GENERATE,
        HttpStatus.FORBIDDEN,
        ErrorCodes.FORBIDDEN_ACCESS,
      );
    }

    const { draftPlayers } = await TeamService.loadDraftPlayers(gId);

    const balanced = balanceTeamsSnakeDraft(draftPlayers);
    const now = clock.now();

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();

    try {
      await session.withTransaction(async () => {
        await GameTeamFormation.findOneAndUpdate(
          { gameId: game._id },
          {
            gameId: game._id,
            teams: balanced.teams,
            balance: balanced.balance,
            reasons: balanced.reasons,
            generatedAt: now,
            generatedBy: actorObjectId,
          },
          { upsert: true, new: true, session, setDefaultsOnInsert: true },
        );

        await GameEvent.create(
          [
            {
              gameId: game._id,
              type: GameEventTypes.TEAMS_GENERATED,
              actorId: actorObjectId,
              payload: {
                balanceDifference: balanced.balance.difference,
                method: balanced.balance.method,
              },
              createdAt: now,
            },
          ],
          { session },
        );

        eventBuffer.buffer({
          type: GameEventTypes.TEAMS_GENERATED,
          gameId: game._id.toString(),
          actorId: actorObjectId.toString(),
          timestamp: now,
          data: {
            balanceDifference: balanced.balance.difference,
            method: balanced.balance.method,
          },
        });
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();

    return {
      teams: balanced.teams,
      balance: balanced.balance,
      reasons: balanced.reasons,
    };
  }

  static async getTeams(
    gameId: Types.ObjectId | string,
    viewerId: Types.ObjectId | string,
  ): Promise<TeamSuggestionPayload> {
    const gId = typeof gameId === 'string' ? new Types.ObjectId(gameId) : gameId;
    const viewerObjectId =
      typeof viewerId === 'string' ? new Types.ObjectId(viewerId) : viewerId;

    const game = await Game.findById(gId);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }

    const isHost = game.hostId.toString() === viewerObjectId.toString();
    if (!isHost) {
      const participation = await GameParticipant.findOne({
        gameId: game._id,
        userId: viewerObjectId,
        status: ParticipantStatuses.JOINED,
      });
      if (!participation) {
        throw new AppError(
          Messages.FORBIDDEN,
          HttpStatus.FORBIDDEN,
          ErrorCodes.FORBIDDEN_ACCESS,
        );
      }
    }

    const saved = await GameTeamFormation.findOne({ gameId: game._id });
    if (!saved) {
      throw new AppError(
        Messages.TEAMS.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.TEAMS_NOT_FOUND,
      );
    }

    return TeamService.toPayload(saved);
  }
}
