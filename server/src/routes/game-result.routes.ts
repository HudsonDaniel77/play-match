import { Router } from 'express';
import * as GameResultController from '../controllers/game-result.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireOnboardingComplete } from '../middleware/require-onboarding-complete.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  gameResultParamsSchema,
  submitResultSchema,
  verifyResultSchema,
  disputeResultSchema,
} from '../validators/game-result.validators.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  authenticate,
  validateRequest(gameResultParamsSchema),
  GameResultController.getResult,
);

router.post(
  '/',
  authenticate,
  requireOnboardingComplete,
  validateRequest(submitResultSchema),
  GameResultController.submitResult,
);

router.post(
  '/verify',
  authenticate,
  requireOnboardingComplete,
  validateRequest(verifyResultSchema),
  GameResultController.verifyResult,
);

router.post(
  '/dispute',
  authenticate,
  requireOnboardingComplete,
  validateRequest(disputeResultSchema),
  GameResultController.disputeResult,
);

export const gameResultRoutes = router;
