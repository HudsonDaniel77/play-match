import type { Request, Response } from 'express';
import { sendError } from '../utils/api-response.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(
    res,
    ErrorCodes.NOT_FOUND,
    `${Messages.NOT_FOUND}: ${req.method} ${req.originalUrl}`,
    HttpStatus.NOT_FOUND,
  );
}
