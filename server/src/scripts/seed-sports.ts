import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Sport } from '../models/sport.model.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export async function seedSportsCatalog(
  seedFilePath?: string,
): Promise<{ seededCount: number }> {
  const targetPath = path.resolve(seedFilePath || config.SPORTS_SEED_FILE);
  logger.info({ targetPath }, 'Reading sports seed data...');

  const rawData = await fs.readFile(targetPath, 'utf-8');
  const sportsData = JSON.parse(rawData);

  if (!Array.isArray(sportsData)) {
    throw new Error('Seed file must contain an array of sport objects');
  }

  let count = 0;
  for (const item of sportsData) {
    if (!item.key || !item.name) {
      logger.warn({ item }, 'Skipping invalid sport seed item (missing key or name)');
      continue;
    }

    await Sport.findOneAndUpdate(
      { key: item.key.toLowerCase().trim() },
      {
        key: item.key.toLowerCase().trim(),
        name: item.name.trim(),
        isActive: item.isActive !== undefined ? item.isActive : true,
        isTeamBased: item.isTeamBased !== undefined ? item.isTeamBased : false,
        allowsDraws: item.allowsDraws !== undefined ? item.allowsDraws : false,
        minPlayers: item.minPlayers,
        maxPlayers: item.maxPlayers,
        skillBands: item.skillBands || [],
        playStyles: item.playStyles || [],
        positions: item.positions || [],
      },
      { upsert: true, new: true },
    );
    count++;
  }

  logger.info({ count }, 'Successfully seeded sports catalog');
  return { seededCount: count };
}

// Standalone script execution
async function runCli(): Promise<void> {
  try {
    logger.info('Connecting to MongoDB for sports catalog seeding...');
    await mongoose.connect(config.MONGODB_URI);
    const { seededCount } = await seedSportsCatalog();
    logger.info(`Seeding finished cleanly: ${seededCount} sports processed`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed sports catalog');
    await mongoose.connection.close();
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('seed-sports.ts') || process.argv[1]?.endsWith('seed-sports.js')) {
  runCli();
}
