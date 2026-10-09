import type { Request, Response, NextFunction } from 'express';
import { leaderboardService } from '../services/leaderboard.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { HttpStatus } from '../constants/http-status.js';
import { Messages } from '../constants/messages.js';

export class LeaderboardController {
  /**
   * Retrieves cursor-paginated leaderboard for a given sport respecting user privacy
   */
  public async getSportLeaderboard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { cursor, limit } = req.query as { cursor?: string; limit?: string };
      const parsedLimit = limit ? parseInt(limit, 10) : undefined;
      const leaderboard = await leaderboardService.getSportLeaderboard(
        req.params.sportKey,
        cursor,
        parsedLimit,
      );
      sendSuccess(
        res,
        leaderboard,
        Messages.LEADERBOARD_FETCHED_SUCCESS,
        HttpStatus.OK,
      );
    } catch (error) {
      next(error);
    }
  }
}

export const leaderboardController = new LeaderboardController();
