import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { TeamService } from '../services/team.service.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';
import { defaultClock } from '../utils/clock.js';

export async function generateTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const gameId = new Types.ObjectId(req.params.gameId);
    const payload = await TeamService.generateTeams(gameId, userId, defaultClock);
    sendCreated(res, payload, Messages.TEAMS.GENERATED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function getTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const gameId = new Types.ObjectId(req.params.gameId);
    const payload = await TeamService.getTeams(gameId, userId);
    sendSuccess(res, payload, Messages.TEAMS.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}
