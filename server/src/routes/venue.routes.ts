import { Router } from 'express';
import * as VenueController from '../controllers/venue.controller.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { requireOnboardingComplete } from '../middleware/require-onboarding-complete.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validate-request.js';
import { Roles } from '../constants/roles.js';
import {
  createVenueSchema,
  updateVenueSchema,
  addCourtSchema,
  updateCourtSchema,
  setWeeklyHoursSchema,
  addClosureSchema,
  discoverVenuesQuerySchema,
} from '../validators/venue.validators.js';

const router = Router();

// Discovery (public — no auth required)
router.get(
  '/',
  validateRequest(discoverVenuesQuerySchema),
  VenueController.discoverVenues,
);

// Create venue (venue_owner or admin, onboarding required)
router.post(
  '/',
  authenticate,
  requireOnboardingComplete,
  authorize(Roles.VENUE_OWNER, Roles.ADMIN),
  validateRequest(createVenueSchema),
  VenueController.createVenue,
);

// My venues (authenticated)
router.get(
  '/mine',
  authenticate,
  VenueController.getMyVenues,
);

// Get venue by ID (public — auth optional; VenueService handles visibility)
router.get(
  '/:id',
  optionalAuthenticate,
  VenueController.getVenueById,
);

// Update venue (owner or admin)
router.patch(
  '/:id',
  authenticate,
  requireOnboardingComplete,
  validateRequest(updateVenueSchema),
  VenueController.updateVenue,
);

// Add court
router.post(
  '/:id/courts',
  authenticate,
  requireOnboardingComplete,
  validateRequest(addCourtSchema),
  VenueController.addCourt,
);

// Update court
router.patch(
  '/:id/courts/:courtId',
  authenticate,
  requireOnboardingComplete,
  validateRequest(updateCourtSchema),
  VenueController.updateCourt,
);

// Set weekly hours
router.put(
  '/:id/hours',
  authenticate,
  requireOnboardingComplete,
  validateRequest(setWeeklyHoursSchema),
  VenueController.setWeeklyHours,
);

// Add closure
router.post(
  '/:id/closures',
  authenticate,
  requireOnboardingComplete,
  validateRequest(addClosureSchema),
  VenueController.addClosure,
);

// Remove closure
router.delete(
  '/:id/closures/:closureId',
  authenticate,
  requireOnboardingComplete,
  VenueController.removeClosure,
);

// Get availability (public)
router.get(
  '/:id/availability',
  VenueController.getVenueAvailability,
);

// Admin actions
router.post(
  '/:id/approve',
  authenticate,
  authorize(Roles.ADMIN),
  VenueController.approveVenue,
);

router.post(
  '/:id/suspend',
  authenticate,
  authorize(Roles.ADMIN),
  VenueController.suspendVenue,
);

router.post(
  '/:id/reinstate',
  authenticate,
  authorize(Roles.ADMIN),
  VenueController.reinstateVenue,
);

export const venueRoutes = router;
