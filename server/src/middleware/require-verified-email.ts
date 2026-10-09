import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { ForbiddenError, AuthError } from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';

export function requireVerifiedEmail(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!config.EMAIL_VERIFICATION_REQUIRED) {
    return next();
  }

  if (!req.user) {
    return next(new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED));
  }

  if (!req.user.isEmailVerified) {
    return next(
      new ForbiddenError(
        Messages.AUTH_EMAIL_NOT_VERIFIED,
        ErrorCodes.AUTH_EMAIL_NOT_VERIFIED,
      ),
    );
  }

  next();
}
