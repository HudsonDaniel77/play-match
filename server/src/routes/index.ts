import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { sportRoutes, adminSportRoutes } from './sport.routes.js';
import { profileRoutes, publicProfileRoutes } from './profile.routes.js';
import { ratingRoutes, adminRatingRoutes } from './rating.routes.js';
import { leaderboardRoutes } from './leaderboard.routes.js';
import { gameRoutes } from './game.routes.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { Roles } from '../constants/roles.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/sports', sportRoutes);
router.use('/admin/sports', adminSportRoutes);
router.use('/profile', profileRoutes);
router.use('/profiles', publicProfileRoutes);
router.use('/ratings', authenticate, ratingRoutes);
router.use('/admin/ratings', authenticate, authorize(Roles.ADMIN), adminRatingRoutes);
router.use('/leaderboards', authenticate, leaderboardRoutes);
router.use('/games', gameRoutes);

export const appRouter = router;

