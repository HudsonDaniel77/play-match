import http from 'node:http';
import mongoose from 'mongoose';
import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

let server: http.Server;

async function startServer(): Promise<void> {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    logger.info('Successfully connected to MongoDB');

    server = http.createServer(app);

    server.listen(config.PORT, () => {
      logger.info(
        {
          port: config.PORT,
          env: config.NODE_ENV,
          basePath: config.API_BASE_PATH,
        },
        `PlayMatch API server listening on http://localhost:${config.PORT}`,
      );
    });

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Graceful shutdown signal received');

      if (server) {
        server.close(async () => {
          logger.info('HTTP server closed');
          try {
            await mongoose.connection.close(false);
            logger.info('MongoDB connection closed cleanly');
            process.exit(0);
          } catch (dbErr) {
            logger.error({ err: dbErr }, 'Error closing MongoDB connection');
            process.exit(1);
          }
        });

        // Force shutdown after timeout if pending requests hang
        setTimeout(() => {
          logger.error('Forceful shutdown: server closing timed out');
          process.exit(1);
        }, 10000).unref();
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start PlayMatch server');
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { startServer };
