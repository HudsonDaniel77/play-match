import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

const router = Router();

router.get('/', (req, res) => {
  healthController.check(req, res);
});

export const healthRoutes = router;
