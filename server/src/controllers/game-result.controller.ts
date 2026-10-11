import type { Request, Response, NextFunction } from 'express';
import { GameResultService } from '../services/game-result.service.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';
import { defaultClock } from '../utils/clock.js';

export async function getResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const gameId = req.params.id;
    const result = await GameResultService.getResult(gameId);
    sendSuccess(res, result, Messages.RESULTS.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function submitResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const gameId = req.params.id;
    const userId = req.user!.id;
    const result = await GameResultService.submitResult(
      gameId,
      userId,
      req.body,
      defaultClock,
    );
    sendCreated(res, result, Messages.RESULTS.SUBMITTED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function verifyResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const gameId = req.params.id;
    const userId = req.user!.id;
    const result = await GameResultService.verifyResult(
      gameId,
      userId,
      defaultClock,
    );
    sendSuccess(res, result, Messages.RESULTS.VERIFIED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function disputeResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const gameId = req.params.id;
    const userId = req.user!.id;
    const reason = req.body?.reason;
    const result = await GameResultService.disputeResult(
      gameId,
      userId,
      reason,
      defaultClock,
    );
    sendSuccess(res, result, Messages.RESULTS.DISPUTED_SUCCESS);
  } catch (err) {
    next(err);
  }
}
