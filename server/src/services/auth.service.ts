import { config } from '../config/index.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { TokenTypes } from '../constants/token-types.js';
import { UserStatuses } from '../constants/user-status.js';
import { Roles, type Role } from '../constants/roles.js';
import type { ClientType } from '../constants/client-types.js';
import { User, type IUserDocument } from '../models/user.model.js';
import { passwordService } from './password.service.js';
import { tokenService } from './token.service.js';
import { emailService } from './email.service.js';
import {
  AuthError,
  AccountLockedError,
  AccountSuspendedError,
  ConflictError,
  NotFoundError,
} from '../utils/app-error.js';

// Pre-computed dummy hash to prevent timing attacks when user does not exist
const DUMMY_HASH = '$2b$12$e8YQz4GvQJzJzJzJzJzJzO7XyO2QY7z6F2G1Qz8F7J6X5V4Y3W2U1';

export interface RegisterDTO {
  email: string;
  password: string;
  name: string;
  role?: Role;
  clientType: ClientType;
  userAgent?: string | null;
  ip?: string | null;
}

export interface LoginDTO {
  email: string;
  password: string;
  clientType: ClientType;
  userAgent?: string | null;
  ip?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: IUserDocument;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Registers a new user, initiates email verification, and issues initial tokens.
   */
  public async register(dto: RegisterDTO): Promise<AuthResult> {
    const existing = await User.findOne({ email: dto.email.toLowerCase().trim() });
    if (existing) {
      throw new ConflictError(
        Messages.USER_ALREADY_EXISTS,
        ErrorCodes.USER_ALREADY_EXISTS,
      );
    }

    passwordService.validateStrength(dto.password);
    const passwordHash = await passwordService.hash(dto.password);

    const user = await User.create({
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      name: dto.name.trim(),
      role: dto.role || Roles.PLAYER,
      isEmailVerified: false,
      status: UserStatuses.ACTIVE,
    });

    // Create and dispatch email verification token
    const verificationToken = await tokenService.createOneTimeToken({
      userId: user._id,
      type: TokenTypes.EMAIL_VERIFICATION,
    });

    await emailService.sendVerificationEmail(user.email, user.name, verificationToken);

    // Issue tokens
    const rawRefreshToken = tokenService.generateRefreshToken();
    await tokenService.createRefreshSession({
      userId: user._id,
      token: rawRefreshToken,
      userAgent: dto.userAgent,
      ip: dto.ip,
      clientType: dto.clientType,
    });

    const accessToken = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    return {
      user,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Authenticates user with email and password, handling failed attempt tracking and lockout.
   */
  public async login(dto: LoginDTO): Promise<AuthResult> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      // Execute timing defense
      await passwordService.compare(dto.password, DUMMY_HASH);
      throw new AuthError(
        Messages.AUTH_GENERIC_INVALID_CREDENTIALS,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
      );
    }

    // Check account lockout
    if (user.isLocked()) {
      throw new AccountLockedError(Messages.AUTH_ACCOUNT_LOCKED);
    }

    // Check account suspension
    if (user.status === UserStatuses.SUSPENDED) {
      throw new AccountSuspendedError(Messages.AUTH_ACCOUNT_SUSPENDED);
    }

    const isMatch = await passwordService.compare(dto.password, user.passwordHash);

    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= config.MAX_FAILED_LOGINS) {
        user.lockUntil = new Date(Date.now() + config.LOCKOUT_MINUTES * 60 * 1000);
      }
      await user.save();
      throw new AuthError(
        Messages.AUTH_GENERIC_INVALID_CREDENTIALS,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
      );
    }

    // Reset lockout counters upon successful authentication
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    // Create refresh session and JWT
    const rawRefreshToken = tokenService.generateRefreshToken();
    await tokenService.createRefreshSession({
      userId: user._id,
      token: rawRefreshToken,
      userAgent: dto.userAgent,
      ip: dto.ip,
      clientType: dto.clientType,
    });

    const accessToken = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    return {
      user,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Refreshes an access token using a valid refresh token with rotation and reuse detection.
   */
  public async refresh(params: {
    refreshToken: string;
    clientType: ClientType;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<{ user: IUserDocument; accessToken: string; newRefreshToken: string }> {
    const { newRefreshToken, session } = await tokenService.rotateRefreshSession({
      rawToken: params.refreshToken,
      userAgent: params.userAgent,
      ip: params.ip,
      clientType: params.clientType,
    });

    const user = await User.findById(session.user);
    if (!user) {
      throw new AuthError(Messages.AUTH_UNAUTHORIZED, ErrorCodes.AUTH_UNAUTHORIZED);
    }

    if (user.status === UserStatuses.SUSPENDED) {
      throw new AccountSuspendedError(Messages.AUTH_ACCOUNT_SUSPENDED);
    }

    const accessToken = tokenService.generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    return {
      user,
      accessToken,
      newRefreshToken,
    };
  }

  /**
   * Revokes the current session refresh token.
   */
  public async logout(refreshToken: string): Promise<void> {
    await tokenService.revokeSessionByToken(refreshToken);
  }

  /**
   * Revokes all active refresh sessions for the user across all devices.
   */
  public async logoutAll(userId: string): Promise<void> {
    await tokenService.revokeAllUserSessions(userId);
  }

  /**
   * Retrieves user profile by id.
   */
  public async getMe(userId: string): Promise<IUserDocument> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError(Messages.USER_NOT_FOUND);
    }
    return user;
  }

  /**
   * Consumes an email verification token and marks user verified.
   */
  public async verifyEmail(token: string): Promise<void> {
    const tokenDoc = await tokenService.verifyAndConsumeOneTimeToken({
      rawToken: token,
      type: TokenTypes.EMAIL_VERIFICATION,
    });

    const user = await User.findById(tokenDoc.user);
    if (user) {
      user.isEmailVerified = true;
      await user.save();
    }
  }

  /**
   * Resends verification email without leaking whether the account exists.
   */
  public async resendVerification(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user && !user.isEmailVerified) {
      const token = await tokenService.createOneTimeToken({
        userId: user._id,
        type: TokenTypes.EMAIL_VERIFICATION,
      });
      await emailService.sendVerificationEmail(user.email, user.name, token);
    }
  }

  /**
   * Handles forgot password requests without leaking whether the account exists.
   */
  public async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      const token = await tokenService.createOneTimeToken({
        userId: user._id,
        type: TokenTypes.PASSWORD_RESET,
      });
      await emailService.sendPasswordResetEmail(user.email, user.name, token);
    }
  }

  /**
   * Resets password using one-time token and invalidates all existing refresh sessions.
   */
  public async resetPassword(token: string, newPassword: string): Promise<void> {
    passwordService.validateStrength(newPassword);

    const tokenDoc = await tokenService.verifyAndConsumeOneTimeToken({
      rawToken: token,
      type: TokenTypes.PASSWORD_RESET,
    });

    const user = await User.findById(tokenDoc.user).select('+passwordHash');
    if (!user) {
      throw new NotFoundError(Messages.USER_NOT_FOUND);
    }

    user.passwordHash = await passwordService.hash(newPassword);
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Revoke all active sessions for security
    await tokenService.revokeAllUserSessions(user._id);
  }

  /**
   * Changes password for an authenticated user and invalidates all existing sessions.
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      throw new NotFoundError(Messages.USER_NOT_FOUND);
    }

    const isMatch = await passwordService.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new AuthError(
        Messages.AUTH_CURRENT_PASSWORD_INCORRECT,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
      );
    }

    passwordService.validateStrength(newPassword);
    user.passwordHash = await passwordService.hash(newPassword);
    await user.save();

    // Revoke all sessions
    await tokenService.revokeAllUserSessions(userId);
  }
}

export const authService = new AuthService();
