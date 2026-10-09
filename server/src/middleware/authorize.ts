import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../constants/roles.js';
import { ForbiddenError, AuthError } from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(Messages.FORBIDDEN, ErrorCodes.FORBIDDEN_ACCESS));
    }

    next();
  };
}
