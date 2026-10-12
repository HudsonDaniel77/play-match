import { Router } from 'express';
import { ratingController } from '../controllers/rating.controller.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  applyMatchResultSchema,
  previewMatchSchema,
  historyQuerySchema,
} from '../validators/rating.validators.js';

// Router for authenticated player rating endpoints (mounted under /ratings)
const ratingRouter = Router();

ratingRouter.get('/me', ratingController.getMyRatings);

ratingRouter.get(
  '/me/:sportKey/history',
  validateRequest(historyQuerySchema),
  ratingController.getMySportHistory,
);

ratingRouter.get(
  '/me/:sportKey/events/:eventId/explanation',
  ratingController.getEventExplanation,
);

ratingRouter.post(
  '/preview',
  validateRequest(previewMatchSchema),
  ratingController.previewMatch,
);

export const ratingRoutes = ratingRouter;

// Router for admin rating endpoints (mounted under /admin/ratings)
const adminRatingRouter = Router();

adminRatingRouter.post(
  '/match-results',
  validateRequest(applyMatchResultSchema),
  ratingController.applyMatchResult,
);

adminRatingRouter.post(
  '/match-results/:id/void',
  ratingController.voidMatchResult,
);

export const adminRatingRoutes = adminRatingRouter;
