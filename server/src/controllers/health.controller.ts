import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { sendSuccess, sendError } from '../utils/api-response.js';
import { HttpStatus } from '../constants/http-status.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';

export class HealthController {
  public check(_req: Request, res: Response): Response {
    const isDbConnected = mongoose.connection.readyState === 1;

    if (!isDbConnected) {
      return sendError(
        res,
        ErrorCodes.DATABASE_ERROR,
        Messages.DATABASE_DISCONNECTED,
        HttpStatus.SERVICE_UNAVAILABLE,
        { readyState: mongoose.connection.readyState },
      );
    }

    return sendSuccess(
      res,
      {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
      Messages.HEALTH_CHECK_HEALTHY,
      HttpStatus.OK,
    );
  }
}

export const healthController = new HealthController();
