import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const RUNTIME_DIR = path.resolve(process.cwd(), '.runtime');
const URI_FILE = path.join(RUNTIME_DIR, 'mongo-memory-uri.txt');

async function startMemoryReplSet(): Promise<void> {
  logger.info('Starting local persistent in-memory MongoDB replica set...');

  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
      name: 'rs0',
    },
    instanceOpts: [
      {
        port: 27017,
      },
    ],
  });

  const uri = replSet.getUri('playmatch');
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  await fs.writeFile(URI_FILE, uri, 'utf-8');

  logger.info({ uri }, 'Local MongoDB replica set is running and ready for connections');
  logger.info('Press Ctrl+C to terminate the in-memory database');

  const shutdown = async () => {
    logger.info('Shutting down in-memory MongoDB replica set...');
    try {
      await fs.unlink(URI_FILE).catch(() => {});
      await replSet.stop();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startMemoryReplSet().catch((err) => {
  logger.error({ err }, 'Failed to start in-memory MongoDB replica set');
  process.exit(1);
});
