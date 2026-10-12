import { Router } from 'express';
import * as RecommendationController from '../controllers/recommendation.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireOnboardingComplete } from '../middleware/require-onboarding-complete.js';
import { validateRequest } from '../middleware/validate-request.js';
import { getRecommendationsQuerySchema } from '../validators/recommendation.validators.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requireOnboardingComplete,
  validateRequest(getRecommendationsQuerySchema),
  RecommendationController.getRecommendations,
);

export const recommendationRoutes = router;
