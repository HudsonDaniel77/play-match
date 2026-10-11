import type { Request, Response, NextFunction } from 'express';
import { ReliabilityService } from '../services/reliability.service.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';
import { defaultClock } from '../utils/clock.js';

export async function getMyReliability(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const data = await ReliabilityService.getReliability(userId, userId, defaultClock);
    sendSuccess(res, data, Messages.RELIABILITY.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function getUserReliability(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await ReliabilityService.getReliability(
      req.params.userId,
      req.user!.id,
      defaultClock,
    );
    sendSuccess(res, data, Messages.RELIABILITY.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function submitFeedback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const feedback = await ReliabilityService.submitFeedback(
      req.params.id,
      req.user!.id,
      req.body,
      defaultClock,
    );
    sendCreated(res, feedback, Messages.FEEDBACK.SUBMITTED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

export async function getGameFeedback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const feedback = await ReliabilityService.listGameFeedback(req.params.id, req.user!.id);
    sendSuccess(res, { feedback }, Messages.FEEDBACK.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}
