import jwt, { type SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../config/index.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import type { Role } from '../constants/roles.js';
import type { ClientType } from '../constants/client-types.js';
import type { TokenType } from '../constants/token-types.js';
import {
  RefreshSession,
  type IRefreshSessionDocument,
} from '../models/refresh-session.model.js';
import {
  OneTimeToken,
  type IOneTimeTokenDocument,
} from '../models/one-time-token.model.js';
import {
  generateRandomToken,
  hashToken,
  generateUuid,
} from '../utils/crypto.js';
import { AuthError } from '../utils/app-error.js';

export interface AccessTokenPayload {
  userId: string;
  role: Role;
  email: string;
}

export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    const parsed = Number(duration);
    if (!isNaN(parsed)) return parsed * 1000;
    return 15 * 60 * 1000; // default 15m
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}

export class TokenService {
  /**
   * Signs a short-lived access JWT containing user identity and role.
   */
  public generateAccessToken(payload: AccessTokenPayload): string {
    const options: SignOptions = {
      expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(payload, config.JWT_ACCESS_SECRET, options);
  }

  /**
   * Verifies an access token and extracts the payload.
   * Throws AuthError if expired or invalid.
   */
  public verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthError(Messages.AUTH_TOKEN_EXPIRED, ErrorCodes.AUTH_TOKEN_EXPIRED);
      }
      throw new AuthError(Messages.AUTH_TOKEN_INVALID, ErrorCodes.AUTH_TOKEN_INVALID);
    }
  }

  /**
   * Generates a secure random refresh token string.
   */
  public generateRefreshToken(): string {
    return generateRandomToken(32);
  }

  /**
   * Creates and stores a new refresh session with a unique family ID or linked to existing family.
   */
  public async createRefreshSession(params: {
    userId: string | Types.ObjectId;
    token: string;
    family?: string;
    userAgent?: string | null;
    ip?: string | null;
    clientType: ClientType;
  }): Promise<IRefreshSessionDocument> {
    const tokenHash = hashToken(params.token);
    const ttlMs = parseDurationToMs(config.REFRESH_TOKEN_TTL);
    const expiresAt = new Date(Date.now() + ttlMs);
    const family = params.family || generateUuid();

    const session = await RefreshSession.create({
      user: new Types.ObjectId(params.userId),
      tokenHash,
      family,
      userAgent: params.userAgent || null,
      ip: params.ip || null,
      clientType: params.clientType,
      expiresAt,
    });

    return session;
  }

  /**
   * Rotates a refresh token: revokes the existing session, issues a new token,
   * and links it within the same family.
   * If reuse is detected (token already revoked or replaced), revokes the whole family!
   */
  public async rotateRefreshSession(params: {
    rawToken: string;
    userAgent?: string | null;
    ip?: string | null;
    clientType: ClientType;
  }): Promise<{ newRefreshToken: string; session: IRefreshSessionDocument }> {
    const tokenHash = hashToken(params.rawToken);
    const session = await RefreshSession.findOne({ tokenHash });

    if (!session) {
      throw new AuthError(
        Messages.AUTH_REFRESH_TOKEN_INVALID,
        ErrorCodes.AUTH_TOKEN_INVALID,
      );
    }

    // Reuse detection: If session was already revoked or replaced, revoke whole family!
    if (session.revokedAt !== null && session.revokedAt !== undefined || session.replacedBy) {
      await RefreshSession.updateMany(
        { family: session.family },
        { revokedAt: new Date() },
      );
      throw new AuthError(
        Messages.AUTH_TOKEN_REUSE_DETECTED,
        ErrorCodes.AUTH_TOKEN_REUSE_DETECTED,
      );
    }

    // Check expiration
    if (session.expiresAt <= new Date()) {
      throw new AuthError(
        Messages.AUTH_REFRESH_TOKEN_INVALID,
        ErrorCodes.AUTH_TOKEN_EXPIRED,
      );
    }

    // Rotate: Issue new token
    const newRefreshToken = this.generateRefreshToken();
    const newSession = await this.createRefreshSession({
      userId: session.user,
      token: newRefreshToken,
      family: session.family,
      userAgent: params.userAgent || session.userAgent,
      ip: params.ip || session.ip,
      clientType: params.clientType,
    });

    // Mark current session as replaced and revoked
    session.revokedAt = new Date();
    session.replacedBy = newSession._id as Types.ObjectId;
    await session.save();

    return {
      newRefreshToken,
      session: newSession,
    };
  }

  /**
   * Revokes a single refresh session by raw token.
   */
  public async revokeSessionByToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await RefreshSession.updateOne(
      { tokenHash, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  /**
   * Revokes all active refresh sessions for a specific user.
   */
  public async revokeAllUserSessions(userId: string | Types.ObjectId): Promise<void> {
    await RefreshSession.updateMany(
      { user: new Types.ObjectId(userId), revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  /**
   * Creates a one-time token (email verification or password reset).
   * Invalidates any existing unconsumed tokens for this user and type.
   */
  public async createOneTimeToken(params: {
    userId: string | Types.ObjectId;
    type: TokenType;
  }): Promise<string> {
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);

    // Invalidate prior unused tokens of this type for this user
    await OneTimeToken.deleteMany({
      user: new Types.ObjectId(params.userId),
      type: params.type,
      usedAt: null,
    });

    const ttlDuration =
      params.type === 'email_verification'
        ? config.EMAIL_TOKEN_TTL
        : config.PASSWORD_RESET_TOKEN_TTL;
    const ttlMs = parseDurationToMs(ttlDuration);
    const expiresAt = new Date(Date.now() + ttlMs);

    await OneTimeToken.create({
      user: new Types.ObjectId(params.userId),
      type: params.type,
      tokenHash,
      expiresAt,
    });

    return rawToken;
  }

  /**
   * Verifies and marks a one-time token as consumed.
   */
  public async verifyAndConsumeOneTimeToken(params: {
    rawToken: string;
    type: TokenType;
  }): Promise<IOneTimeTokenDocument> {
    const tokenHash = hashToken(params.rawToken);
    const tokenDoc = await OneTimeToken.findOne({
      tokenHash,
      type: params.type,
    });

    if (!tokenDoc || !tokenDoc.isValid()) {
      const message =
        params.type === 'email_verification'
          ? Messages.AUTH_VERIFICATION_TOKEN_INVALID
          : Messages.AUTH_RESET_TOKEN_INVALID;
      throw new AuthError(message, ErrorCodes.AUTH_TOKEN_INVALID);
    }

    tokenDoc.usedAt = new Date();
    await tokenDoc.save();

    return tokenDoc;
  }
}

export const tokenService = new TokenService();
