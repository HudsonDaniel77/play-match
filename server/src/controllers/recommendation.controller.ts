import type { Request, Response, NextFunction } from 'express';
import { RecommendationService } from '../services/recommendation.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';
import { defaultClock } from '../utils/clock.js';
import type { GetRecommendationsQuery } from '../validators/recommendation.validators.js';

export async function getRecommendations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const query = req.query as unknown as GetRecommendationsQuery;
    const data = await RecommendationService.getRecommendations(
      userId,
      query,
      defaultClock,
    );
    sendSuccess(res, data, Messages.RECOMMENDATIONS.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}
