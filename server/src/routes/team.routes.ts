import { Router } from 'express';
import * as TeamController from '../controllers/team.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireOnboardingComplete } from '../middleware/require-onboarding-complete.js';
import { validateRequest } from '../middleware/validate-request.js';
import { gameTeamsParamsSchema, generateTeamsSchema } from '../validators/team.validators.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  authenticate,
  requireOnboardingComplete,
  validateRequest(gameTeamsParamsSchema),
  TeamController.getTeams,
);

router.post(
  '/generate',
  authenticate,
  requireOnboardingComplete,
  validateRequest(generateTeamsSchema),
  TeamController.generateTeams,
);

export const teamRoutes = router;
