import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject, ZodError } from 'zod';
import { ValidationError } from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';

export function validateRequest(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers,
      });

      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;

      next();
    } catch (error) {
      const zodError = error as ZodError;
      const details = zodError.errors.map((err) => ({
        field: err.path.slice(1).join('.') || err.path.join('.'),
        message: err.message,
      }));
      next(new ValidationError(Messages.VALIDATION_ERROR, details));
    }
  };
}
