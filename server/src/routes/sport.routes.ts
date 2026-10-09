import { Router } from 'express';
import { sportController } from '../controllers/sport.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validate-request.js';
import { Roles } from '../constants/roles.js';
import {
  createSportSchema,
  updateSportSchema,
} from '../validators/sport.validators.js';

const router = Router();

// Public: Get active sports catalog
router.get('/', sportController.getActiveSports);

export const sportRoutes = router;

// Admin sport catalog management router
const adminRouter = Router();

adminRouter.get('/', authenticate, authorize(Roles.ADMIN), sportController.getAllSports);
adminRouter.post(
  '/',
  authenticate,
  authorize(Roles.ADMIN),
  validateRequest(createSportSchema),
  sportController.createSport,
);
adminRouter.patch(
  '/:id',
  authenticate,
  authorize(Roles.ADMIN),
  validateRequest(updateSportSchema),
  sportController.updateSport,
);

export const adminSportRoutes = adminRouter;
