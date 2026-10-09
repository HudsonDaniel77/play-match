import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { AppError } from '../utils/app-error.js';
import { sendError } from '../utils/api-response.js';
import { logger } from '../utils/logger.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyPattern?: Record<string, number>;
  keyValue?: Record<string, unknown>;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Operational errors created deliberately via AppError
  if (err instanceof AppError) {
    if (err.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      logger.error({ err, path: req.path, method: req.method }, 'Operational server error');
    } else {
      logger.warn({ err: err.message, code: err.code, path: req.path }, 'Operational client warning');
    }

    sendError(
      res,
      err.code,
      err.message,
      err.statusCode,
      err.details,
      config.NODE_ENV === 'development' ? err.stack : undefined,
    );
    return;
  }

  // Handle Mongoose duplicate key error (code 11000)
  const mongoErr = err as MongoDuplicateKeyError;
  if (mongoErr.code === 11000) {
    logger.warn({ err: mongoErr.message, path: req.path }, 'Mongoose duplicate key conflict');
    sendError(
      res,
      ErrorCodes.USER_ALREADY_EXISTS,
      Messages.USER_ALREADY_EXISTS,
      HttpStatus.CONFLICT,
    );
    return;
  }

  // Handle Mongoose ValidationError
  if (err.name === 'ValidationError') {
    logger.warn({ err: err.message, path: req.path }, 'Mongoose validation error');
    sendError(
      res,
      ErrorCodes.VALIDATION_ERROR,
      err.message,
      HttpStatus.BAD_REQUEST,
    );
    return;
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    logger.warn({ err: err.message, path: req.path }, 'Mongoose invalid cast error');
    sendError(
      res,
      ErrorCodes.VALIDATION_ERROR,
      'Invalid format for specified identifier',
      HttpStatus.BAD_REQUEST,
    );
    return;
  }

  // Unhandled unexpected exceptions
  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
      stack: err.stack,
    },
    'Unhandled server error occurred',
  );

  sendError(
    res,
    ErrorCodes.INTERNAL_SERVER_ERROR,
    Messages.INTERNAL_SERVER_ERROR,
    HttpStatus.INTERNAL_SERVER_ERROR,
    undefined,
    config.NODE_ENV === 'development' ? err.stack : undefined,
  );
}
