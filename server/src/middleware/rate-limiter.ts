import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { sendError } from '../utils/api-response.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';

export const generalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.NODE_ENV === 'test' ? 1000 : config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(
      res,
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      Messages.RATE_LIMIT_EXCEEDED,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const authRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.NODE_ENV === 'test' ? 1000 : config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(
      res,
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      Messages.RATE_LIMIT_EXCEEDED,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});
