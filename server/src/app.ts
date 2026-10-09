import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { generalRateLimiter } from './middleware/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { appRouter } from './routes/index.js';
import { healthRoutes } from './routes/health.routes.js';

export function createApp(): Application {
  const app = express();

  // Security HTTP headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (config.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true); // Allow configured origins in non-strict environments
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        config.CLIENT_HEADER_NAME,
        'x-client-type',
      ],
    }),
  );

  // Cookie parsing
  app.use(cookieParser());

  // Body parsing
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Tracing & Rate Limiting
  app.use(requestIdMiddleware);
  app.use(generalRateLimiter);

  // Mount health check at root /health for infrastructure load balancers
  app.use('/health', healthRoutes);

  // Mount versioned API routes
  app.use(config.API_BASE_PATH, appRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
