import type { Request, Response, NextFunction } from 'express';
import { Profile } from '../models/profile.model.js';
import { OnboardingStatuses } from '../constants/onboarding-steps.js';
import { ForbiddenError, AuthError } from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';

export async function requireOnboardingComplete(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED);
    }

    const profile = await Profile.findOne({ user: req.user.id });
    if (!profile || profile.onboarding.status !== OnboardingStatuses.COMPLETED) {
      throw new ForbiddenError(
        Messages.ONBOARDING_INCOMPLETE,
        ErrorCodes.ONBOARDING_INCOMPLETE,
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
