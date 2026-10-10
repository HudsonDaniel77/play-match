import type { Request, Response, NextFunction } from 'express';
import { tokenService, type AccessTokenPayload } from '../services/token.service.js';
import { User, type IUserDocument } from '../models/user.model.js';
import {
  AuthError,
  AccountSuspendedError,
} from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { UserStatuses } from '../constants/user-status.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUserDocument;
      tokenPayload?: AccessTokenPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED);
    }

    const payload = tokenService.verifyAccessToken(token);

    const user = await User.findById(payload.userId);
    if (!user) {
      throw new AuthError(Messages.USER_NOT_FOUND, ErrorCodes.AUTH_UNAUTHORIZED);
    }

    if (user.status === UserStatuses.SUSPENDED) {
      throw new AccountSuspendedError(Messages.AUTH_ACCOUNT_SUSPENDED);
    }

    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return next();
    }

    try {
      const payload = tokenService.verifyAccessToken(token);
      const user = await User.findById(payload.userId);
      if (user && user.status !== UserStatuses.SUSPENDED) {
        req.user = user;
        req.tokenPayload = payload;
      }
    } catch {
      // Ignore token decode errors for optional auth
    }

    next();
  } catch (error) {
    next(error);
  }
}

