import { Router } from 'express';
import * as ReliabilityController from '../controllers/reliability.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireOnboardingComplete } from '../middleware/require-onboarding-complete.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  gameFeedbackParamsSchema,
  submitFeedbackSchema,
  userReliabilityParamsSchema,
} from '../validators/reliability.validators.js';

// Mounted at /reliability
const reliabilityRouter = Router();

// NOTE: '/me' must be registered before '/:userId'
reliabilityRouter.get('/me', authenticate, ReliabilityController.getMyReliability);

reliabilityRouter.get(
  '/:userId',
  authenticate,
  validateRequest(userReliabilityParamsSchema),
  ReliabilityController.getUserReliability,
);

// Mounted at /games/:id/feedback
const gameFeedbackRouter = Router({ mergeParams: true });

gameFeedbackRouter.get(
  '/',
  authenticate,
  validateRequest(gameFeedbackParamsSchema),
  ReliabilityController.getGameFeedback,
);

gameFeedbackRouter.post(
  '/',
  authenticate,
  requireOnboardingComplete,
  validateRequest(submitFeedbackSchema),
  ReliabilityController.submitFeedback,
);

export const reliabilityRoutes = reliabilityRouter;
export const gameFeedbackRoutes = gameFeedbackRouter;
