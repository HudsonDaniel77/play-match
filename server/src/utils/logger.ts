import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'password',
      'passwordHash',
      'currentPassword',
      'newPassword',
      'token',
      'tokenHash',
      'refreshToken',
      'accessToken',
      'body.password',
      'body.currentPassword',
      'body.newPassword',
      'body.token',
      'body.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
});
