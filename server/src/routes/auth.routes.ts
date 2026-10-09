import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validate-request.js';
import { authenticate } from '../middleware/authenticate.js';
import { authRateLimiter } from '../middleware/rate-limiter.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validators.js';

const router = Router();

// Registration & Login
router.post(
  '/register',
  authRateLimiter,
  validateRequest(registerSchema),
  authController.register,
);

router.post(
  '/login',
  authRateLimiter,
  validateRequest(loginSchema),
  authController.login,
);

// Session Lifecycle
router.post(
  '/refresh',
  authRateLimiter,
  validateRequest(refreshTokenSchema),
  authController.refresh,
);

router.post(
  '/logout',
  validateRequest(logoutSchema),
  authController.logout,
);

router.post(
  '/logout-all',
  authenticate,
  authController.logoutAll,
);

router.get(
  '/me',
  authenticate,
  authController.getMe,
);

// Email Verification
router.post(
  '/verify-email',
  authRateLimiter,
  validateRequest(verifyEmailSchema),
  authController.verifyEmail,
);

router.post(
  '/resend-verification',
  authRateLimiter,
  validateRequest(resendVerificationSchema),
  authController.resendVerification,
);

// Password Management
router.post(
  '/forgot-password',
  authRateLimiter,
  validateRequest(forgotPasswordSchema),
  authController.forgotPassword,
);

router.post(
  '/reset-password',
  authRateLimiter,
  validateRequest(resetPasswordSchema),
  authController.resetPassword,
);

router.post(
  '/change-password',
  authenticate,
  validateRequest(changePasswordSchema),
  authController.changePassword,
);

export const authRoutes = router;
