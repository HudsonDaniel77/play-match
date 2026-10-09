import type { Request, Response, NextFunction } from 'express';
import { ratingEngineService } from '../services/rating-engine.service.js';
import { ratingHistoryService } from '../services/rating-history.service.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';

export class RatingController {
  /**
   * Admin: Submit verified match result and atomically update all participant ratings
   */
  public async applyMatchResult(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await ratingEngineService.applyMatchResult(
        req.body,
        req.user!.id,
      );
      sendCreated(
        res,
        result,
        Messages.MATCH_RESULT_APPLIED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Void an applied match result and revert ratings if no subsequent games exist
   */
  public async voidMatchResult(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await ratingEngineService.voidMatchResult(
        req.params.id,
        req.user!.id,
      );
      sendSuccess(
        res,
        result,
        Messages.MATCH_RESULT_VOIDED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Player: Retrieve all ratings across sports with bands and confidence
   */
  public async getMyRatings(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ratings = await ratingHistoryService.getMyRatings(req.user!.id);
      sendSuccess(
        res,
        { ratings },
        Messages.RATINGS_FETCHED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Player: Retrieve cursor-paginated ledger events for a sport
   */
  public async getMySportHistory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { cursor, limit } = req.query as { cursor?: string; limit?: string };
      const parsedLimit = limit ? parseInt(limit, 10) : undefined;
      const history = await ratingHistoryService.getMySportHistory(
        req.user!.id,
        req.params.sportKey,
        cursor,
        parsedLimit,
      );
      sendSuccess(
        res,
        history,
        Messages.HISTORY_FETCHED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Player: Retrieve structured metrics and plain-language explanation for an event
   */
  public async getEventExplanation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const explanation = await ratingHistoryService.getEventExplanation(
        req.user!.id,
        req.params.sportKey,
        req.params.eventId,
      );
      sendSuccess(
        res,
        explanation,
        Messages.EXPLANATION_FETCHED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Player: Calculate hypothetical match probabilities and rating deltas
   */
  public async previewMatch(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const preview = await ratingEngineService.previewMatch(
        req.body,
        req.user!.id,
      );
      sendSuccess(
        res,
        preview,
        Messages.PREVIEW_CALCULATED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  }
}

export const ratingController = new RatingController();
