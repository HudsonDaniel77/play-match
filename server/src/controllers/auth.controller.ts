import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { ClientTypes, type ClientType } from '../constants/client-types.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { authService } from '../services/auth.service.js';
import { parseDurationToMs } from '../services/token.service.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { AuthError } from '../utils/app-error.js';

export class AuthController {
  /**
   * Helper to resolve client type from headers.
   */
  private getClientType(req: Request): ClientType {
    const headerValue = (
      req.headers[config.CLIENT_HEADER_NAME.toLowerCase()] ||
      req.headers['x-client-type']
    )?.toString().toLowerCase();

    if (headerValue === ClientTypes.MOBILE) {
      return ClientTypes.MOBILE;
    }
    return ClientTypes.WEB;
  }

  /**
   * Helper to set httpOnly refresh cookie for web clients.
   */
  private setRefreshCookie(res: Response, refreshToken: string): void {
    const maxAge = parseDurationToMs(config.REFRESH_TOKEN_TTL);
    res.cookie(config.REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: config.COOKIE_SAMESITE as 'lax' | 'strict' | 'none',
      domain: config.COOKIE_DOMAIN || undefined,
      path: `${config.API_BASE_PATH}/auth`,
      maxAge,
    });
  }

  /**
   * Helper to clear refresh cookie.
   */
  private clearRefreshCookie(res: Response): void {
    res.clearCookie(config.REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: config.COOKIE_SAMESITE as 'lax' | 'strict' | 'none',
      domain: config.COOKIE_DOMAIN || undefined,
      path: `${config.API_BASE_PATH}/auth`,
    });
  }

  public register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const clientType = this.getClientType(req);
      const { email, password, name, role } = req.body;
      const userAgent = req.headers['user-agent'] || null;
      const ip = req.ip || null;

      const result = await authService.register({
        email,
        password,
        name,
        role,
        clientType,
        userAgent,
        ip,
      });

      if (clientType === ClientTypes.WEB) {
        this.setRefreshCookie(res, result.refreshToken);
        sendCreated(
          res,
          {
            user: result.user,
            accessToken: result.accessToken,
          },
          Messages.AUTH_REGISTER_SUCCESS,
        );
      } else {
        sendCreated(
          res,
          {
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          },
          Messages.AUTH_REGISTER_SUCCESS,
        );
      }
    } catch (error) {
      next(error);
    }
  };

  public login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const clientType = this.getClientType(req);
      const { email, password } = req.body;
      const userAgent = req.headers['user-agent'] || null;
      const ip = req.ip || null;

      const result = await authService.login({
        email,
        password,
        clientType,
        userAgent,
        ip,
      });

      if (clientType === ClientTypes.WEB) {
        this.setRefreshCookie(res, result.refreshToken);
        sendSuccess(
          res,
          {
            user: result.user,
            accessToken: result.accessToken,
          },
          Messages.AUTH_LOGIN_SUCCESS,
        );
      } else {
        sendSuccess(
          res,
          {
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          },
          Messages.AUTH_LOGIN_SUCCESS,
        );
      }
    } catch (error) {
      next(error);
    }
  };

  public refresh = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const clientType = this.getClientType(req);
      const refreshToken =
        req.cookies?.[config.REFRESH_COOKIE_NAME] || req.body?.refreshToken;

      if (!refreshToken) {
        throw new AuthError(
          Messages.AUTH_REFRESH_TOKEN_INVALID,
          ErrorCodes.AUTH_TOKEN_INVALID,
        );
      }

      const userAgent = req.headers['user-agent'] || null;
      const ip = req.ip || null;

      const result = await authService.refresh({
        refreshToken,
        clientType,
        userAgent,
        ip,
      });

      if (clientType === ClientTypes.WEB) {
        this.setRefreshCookie(res, result.newRefreshToken);
        sendSuccess(res, {
          user: result.user,
          accessToken: result.accessToken,
        });
      } else {
        sendSuccess(res, {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.newRefreshToken,
        });
      }
    } catch (error) {
      next(error);
    }
  };

  public logout = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const refreshToken =
        req.cookies?.[config.REFRESH_COOKIE_NAME] || req.body?.refreshToken;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      this.clearRefreshCookie(res);
      sendSuccess(res, undefined, Messages.AUTH_LOGOUT_SUCCESS);
    } catch (error) {
      next(error);
    }
  };

  public logoutAll = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED);
      }

      await authService.logoutAll(req.user.id);
      this.clearRefreshCookie(res);
      sendSuccess(res, undefined, Messages.AUTH_LOGOUT_ALL_SUCCESS);
    } catch (error) {
      next(error);
    }
  };

  public getMe = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED);
      }

      const user = await authService.getMe(req.user.id);
      sendSuccess(res, { user });
    } catch (error) {
      next(error);
    }
  };

  public verifyEmail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { token } = req.body;
      await authService.verifyEmail(token);
      sendSuccess(res, undefined, Messages.AUTH_EMAIL_VERIFIED_SUCCESS);
    } catch (error) {
      next(error);
    }
  };

  public resendVerification = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email } = req.body;
      await authService.resendVerification(email);
      sendSuccess(res, undefined, Messages.AUTH_RESEND_VERIFICATION_GENERIC);
    } catch (error) {
      next(error);
    }
  };

  public forgotPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email } = req.body;
      await authService.forgotPassword(email);
      sendSuccess(res, undefined, Messages.AUTH_FORGOT_PASSWORD_GENERIC);
    } catch (error) {
      next(error);
    }
  };

  public resetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { token, newPassword } = req.body;
      await authService.resetPassword(token, newPassword);
      this.clearRefreshCookie(res);
      sendSuccess(res, undefined, Messages.AUTH_RESET_PASSWORD_SUCCESS);
    } catch (error) {
      next(error);
    }
  };

  public changePassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED);
      }

      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword);
      this.clearRefreshCookie(res);
      sendSuccess(res, undefined, Messages.AUTH_CHANGE_PASSWORD_SUCCESS);
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
