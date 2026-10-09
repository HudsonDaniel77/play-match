import type { Response } from 'express';
import { HttpStatus, type HttpStatusCode } from '../constants/http-status.js';
import type { ErrorCode } from '../constants/error-codes.js';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

export interface ApiErrorPayload {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  stack?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export function sendSuccess<T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode: HttpStatusCode = HttpStatus.OK,
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
  };
  if (data !== undefined) {
    body.data = data;
  }
  if (message !== undefined) {
    body.message = message;
  }
  return res.status(statusCode).json(body);
}

export function sendCreated<T>(
  res: Response,
  data?: T,
  message?: string,
): Response {
  return sendSuccess(res, data, message, HttpStatus.CREATED);
}

export function sendError(
  res: Response,
  code: ErrorCode | string,
  message: string,
  statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
  details?: unknown,
  stack?: string,
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };
  if (details !== undefined) {
    body.error.details = details;
  }
  if (stack !== undefined) {
    body.error.stack = stack;
  }
  return res.status(statusCode).json(body);
}
