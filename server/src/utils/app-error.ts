import { ErrorCodes, type ErrorCode } from '../constants/error-codes.js';
import { HttpStatus, type HttpStatusCode } from '../constants/http-status.js';
import { Messages } from '../constants/messages.js';

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode = ErrorCodes.INTERNAL_SERVER_ERROR,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string = Messages.VALIDATION_ERROR,
    codeOrDetails?: ErrorCode | unknown,
    details?: unknown,
  ) {
    const isCode =
      typeof codeOrDetails === 'string' &&
      Object.values(ErrorCodes).includes(codeOrDetails as ErrorCode);
    const code = isCode ? (codeOrDetails as ErrorCode) : ErrorCodes.VALIDATION_ERROR;
    const det = isCode ? details : codeOrDetails;
    super(message, HttpStatus.BAD_REQUEST, code, det);
  }
}

export class AuthError extends AppError {
  constructor(
    message: string = Messages.AUTH_GENERIC_INVALID_CREDENTIALS,
    code: ErrorCode = ErrorCodes.AUTH_INVALID_CREDENTIALS,
    details?: unknown,
  ) {
    super(message, HttpStatus.UNAUTHORIZED, code, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message: string = Messages.FORBIDDEN,
    code: ErrorCode = ErrorCodes.FORBIDDEN_ACCESS,
    details?: unknown,
  ) {
    super(message, HttpStatus.FORBIDDEN, code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = Messages.NOT_FOUND, details?: unknown) {
    super(message, HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND, details);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string = Messages.USER_ALREADY_EXISTS,
    code: ErrorCode = ErrorCodes.USER_ALREADY_EXISTS,
    details?: unknown,
  ) {
    super(message, HttpStatus.CONFLICT, code, details);
  }
}

export class AccountLockedError extends AppError {
  constructor(message: string = Messages.AUTH_ACCOUNT_LOCKED, details?: unknown) {
    super(message, HttpStatus.LOCKED, ErrorCodes.AUTH_ACCOUNT_LOCKED, details);
  }
}

export class AccountSuspendedError extends AppError {
  constructor(message: string = Messages.AUTH_ACCOUNT_SUSPENDED, details?: unknown) {
    super(message, HttpStatus.FORBIDDEN, ErrorCodes.AUTH_ACCOUNT_SUSPENDED, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = Messages.RATE_LIMIT_EXCEEDED, details?: unknown) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMIT_EXCEEDED, details);
  }
}
