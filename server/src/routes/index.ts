import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { sportRoutes, adminSportRoutes } from './sport.routes.js';
import { profileRoutes, publicProfileRoutes } from './profile.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/sports', sportRoutes);
router.use('/admin/sports', adminSportRoutes);
router.use('/profile', profileRoutes);
router.use('/profiles', publicProfileRoutes);

export const appRouter = router;
