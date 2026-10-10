import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { GameService } from '../services/game.service.js';
import { GameParticipantService } from '../services/game-participant.service.js';
import { getGameRoster } from '../services/roster.service.js';
import { checkEligibility } from '../services/game-eligibility.service.js';
import { Game } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { GameEvent } from '../models/game-event.model.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { HttpStatus } from '../constants/http-status.js';
import { Messages } from '../constants/messages.js';
import { AppError } from '../utils/app-error.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { ParticipantRoles, ParticipantStatuses } from '../constants/game-constants.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export async function createGame(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const game = await GameService.createGame(userId, req.body);
    const formatted = await GameService.formatGameForViewer(game, userId);
    sendCreated(res, formatted, Messages.GAMES.GAME_CREATED);
  } catch (err) {
    next(err);
  }
}

export async function getGameById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const viewerId = req.user?.id;
    const game = await GameService.getGameById(req.params.id, viewerId);
    sendSuccess(res, game, Messages.GAMES.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function getGameByInviteCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const viewerId = req.user?.id;
    const game = await GameService.getGameByInviteCode(req.params.code, viewerId);
    sendSuccess(res, game, Messages.GAMES.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function updateGame(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const game = await GameService.updateGame(req.params.id, userId, req.body);
    const formatted = await GameService.formatGameForViewer(game, userId);
    sendSuccess(res, formatted, Messages.GAMES.GAME_UPDATED);
  } catch (err) {
    next(err);
  }
}

export async function cancelGame(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role === 'admin' ? 'admin' : 'host';
    const game = await GameService.cancelGame(req.params.id, userId, req.body, userRole);
    const formatted = await GameService.formatGameForViewer(game, userId);
    sendSuccess(res, formatted, Messages.GAMES.GAME_CANCELLED);
  } catch (err) {
    next(err);
  }
}

export async function joinGame(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const result = await GameParticipantService.joinGame(userId, req.params.id);
    sendSuccess(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function leaveGame(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const result = await GameParticipantService.leaveGame(userId, req.params.id);
    sendSuccess(res, result, Messages.GAMES.LEAVE_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function approveParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    await GameParticipantService.approveRequest(userId, req.params.id, req.params.userId);
    sendSuccess(res, null, Messages.GAMES.REQUEST_APPROVED);
  } catch (err) {
    next(err);
  }
}

export async function declineParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    await GameParticipantService.declineRequest(userId, req.params.id, req.params.userId);
    sendSuccess(res, null, Messages.GAMES.REQUEST_DECLINED);
  } catch (err) {
    next(err);
  }
}

export async function removeParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    await GameParticipantService.removeParticipant(
      userId,
      req.params.id,
      req.params.userId,
      req.body?.reason,
    );
    sendSuccess(res, null, Messages.GAMES.PARTICIPANT_REMOVED);
  } catch (err) {
    next(err);
  }
}

export async function getRoster(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const viewerId = req.user?.id;
    const roster = await getGameRoster(req.params.id, viewerId);
    sendSuccess(res, roster, Messages.GAMES.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function checkGameEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const game = await Game.findById(req.params.id);
    if (!game) {
      throw new AppError(
        Messages.GAMES.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.GAME_NOT_FOUND,
      );
    }
    const eligibility = await checkEligibility(userId, game);
    sendSuccess(res, eligibility, Messages.GAMES.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function getTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const events = await GameEvent.find({ gameId: req.params.id }).sort({ createdAt: 1 });
    sendSuccess(res, events, Messages.GAMES.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function getMyGames(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const query = req.query as any;
    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 20), config.GAMES_LIST_PAGE_SIZE_MAX);
    const skip = (page - 1) * limit;

    const partQuery: any = { userId: new Types.ObjectId(userId) };
    if (query.role) {
      partQuery.role = query.role === 'host' ? ParticipantRoles.HOST : ParticipantRoles.PLAYER;
    }
    if (query.participantStatus) {
      partQuery.status = query.participantStatus;
    }

    const participations = await GameParticipant.find(partQuery);
    const gameIds = participations.map((p) => p.gameId);

    const gameQuery: any = { _id: { $in: gameIds } };
    if (query.status) gameQuery.status = query.status;
    if (query.sportKey) gameQuery.sportKey = query.sportKey;

    const total = await Game.countDocuments(gameQuery);
    const games = await Game.find(gameQuery)
      .sort({ startsAt: -1 })
      .skip(skip)
      .limit(limit);

    const formattedGames = await Promise.all(
      games.map((g) => GameService.formatGameForViewer(g, userId)),
    );

    sendSuccess(
      res,
      {
        games: formattedGames,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      Messages.GAMES.FETCH_SUCCESS,
    );
  } catch (err) {
    next(err);
  }
}
