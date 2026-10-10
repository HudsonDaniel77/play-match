import { Router } from 'express';
import * as GameController from '../controllers/game.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireOnboardingComplete } from '../middleware/require-onboarding-complete.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  createGameSchema,
  updateGameSchema,
  cancelGameSchema,
  removeParticipantSchema,
  listGamesQuerySchema,
} from '../validators/game.validators.js';
import { discoverGamesQuerySchema } from '../validators/venue.validators.js';

const router = Router();

// 0. Game discovery (must be before /:id routes to avoid route shadowing)
router.get(
  '/discover',
  authenticate,
  validateRequest(discoverGamesQuerySchema),
  GameController.discoverGames,
);

// 1. My Games list (paginated, filtered)
router.get(
  '/me',
  authenticate,
  validateRequest(listGamesQuerySchema),
  GameController.getMyGames,
);

// 2. Lookup game by invite code (public preview with coarsened location)
router.get(
  '/code/:code',
  GameController.getGameByInviteCode,
);

// 3. Create a new game
router.post(
  '/',
  authenticate,
  requireOnboardingComplete,
  validateRequest(createGameSchema),
  GameController.createGame,
);

// 4. View game details
router.get(
  '/:id',
  authenticate,
  GameController.getGameById,
);

// 5. Update game details
router.patch(
  '/:id',
  authenticate,
  requireOnboardingComplete,
  validateRequest(updateGameSchema),
  GameController.updateGame,
);

// 6. Cancel game
router.post(
  '/:id/cancel',
  authenticate,
  requireOnboardingComplete,
  validateRequest(cancelGameSchema),
  GameController.cancelGame,
);

// 7. Join or request to join game
router.post(
  '/:id/join',
  authenticate,
  requireOnboardingComplete,
  GameController.joinGame,
);

// 8. Leave game
router.post(
  '/:id/leave',
  authenticate,
  requireOnboardingComplete,
  GameController.leaveGame,
);

// 9. Host approves pending join request
router.post(
  '/:id/participants/:userId/approve',
  authenticate,
  requireOnboardingComplete,
  GameController.approveParticipant,
);

// 10. Host declines pending join request
router.post(
  '/:id/participants/:userId/decline',
  authenticate,
  requireOnboardingComplete,
  GameController.declineParticipant,
);

// 11. Host removes joined participant
router.delete(
  '/:id/participants/:userId',
  authenticate,
  requireOnboardingComplete,
  validateRequest(removeParticipantSchema),
  GameController.removeParticipant,
);

// 12. View roster (joined, requested, waitlisted)
router.get(
  '/:id/roster',
  authenticate,
  GameController.getRoster,
);

// 13. Eligibility check pre-flight
router.get(
  '/:id/eligibility',
  authenticate,
  GameController.checkGameEligibility,
);

// 14. Game timeline audit log
router.get(
  '/:id/timeline',
  authenticate,
  GameController.getTimeline,
);

router.get(
  '/:id/events',
  authenticate,
  GameController.getTimeline,
);

// 15. Venue suggestions for a game (host only)
router.get(
  '/:id/venue-suggestions',
  authenticate,
  requireOnboardingComplete,
  GameController.getVenueSuggestions,
);

export const gameRoutes = router;
