import { Router } from 'express';
import { leaderboardController } from '../controllers/leaderboard.controller.js';
import { validateRequest } from '../middleware/validate-request.js';
import { leaderboardQuerySchema } from '../validators/rating.validators.js';

const leaderboardRouter = Router();

leaderboardRouter.get(
  '/:sportKey',
  validateRequest(leaderboardQuerySchema),
  leaderboardController.getSportLeaderboard,
);

export const leaderboardRoutes = leaderboardRouter;
