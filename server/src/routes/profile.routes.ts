import { Router } from 'express';
import { profileController } from '../controllers/profile.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  updateBasicInfoSchema,
  updateSportsSchema,
  updateAvailabilitySchema,
  updateLocationSchema,
  updatePreferencesSchema,
  getPublicProfileSchema,
} from '../validators/profile.validators.js';

// Router for authenticated player profile management: /profile
const router = Router();

router.get('/me', authenticate, profileController.getMyProfile);

router.put(
  '/me/basic',
  authenticate,
  validateRequest(updateBasicInfoSchema),
  profileController.updateBasicInfo,
);

router.put(
  '/me/sports',
  authenticate,
  validateRequest(updateSportsSchema),
  profileController.updateSports,
);

router.put(
  '/me/availability',
  authenticate,
  validateRequest(updateAvailabilitySchema),
  profileController.updateAvailability,
);

router.put(
  '/me/location',
  authenticate,
  validateRequest(updateLocationSchema),
  profileController.updateLocation,
);

router.put(
  '/me/preferences',
  authenticate,
  validateRequest(updatePreferencesSchema),
  profileController.updatePreferences,
);

router.get('/me/onboarding', authenticate, profileController.getOnboarding);

router.post(
  '/me/onboarding/complete',
  authenticate,
  profileController.completeOnboarding,
);

router.get('/me/ratings', authenticate, profileController.getMyRatings);

export const profileRoutes = router;

// Router for public profile viewing: /profiles
const publicRouter = Router();

publicRouter.get(
  '/:userId',
  validateRequest(getPublicProfileSchema),
  profileController.getPublicProfile,
);

export const publicProfileRoutes = publicRouter;
