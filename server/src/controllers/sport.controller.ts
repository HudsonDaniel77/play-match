import type { Request, Response, NextFunction } from 'express';
import { sportService } from '../services/sport.service.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';

export class SportController {
  public getActiveSports = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sports = await sportService.getActiveSports();
      sendSuccess(res, { sports });
    } catch (error) {
      next(error);
    }
  };

  public getAllSports = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sports = await sportService.getAllSports();
      sendSuccess(res, { sports });
    } catch (error) {
      next(error);
    }
  };

  public createSport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sport = await sportService.createSport(req.body);
      sendCreated(res, { sport }, Messages.SPORT_CREATED_SUCCESS);
    } catch (error) {
      next(error);
    }
  };

  public updateSport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sport = await sportService.updateSport(req.params.id, req.body);
      sendSuccess(res, { sport }, Messages.SPORT_UPDATED_SUCCESS);
    } catch (error) {
      next(error);
    }
  };
}

export const sportController = new SportController();
