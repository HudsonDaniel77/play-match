import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Sport } from '../models/sport.model.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface SeedSportsOptions {
  seedFilePath?: string;
  deactivateMissing?: boolean;
  dryRun?: boolean;
}

export interface SeedSportsResult {
  seededCount: number;
  deactivatedCount: number;
  dryRun: boolean;
}

export async function seedSportsCatalog(
  options: SeedSportsOptions = {},
): Promise<SeedSportsResult> {
  const { seedFilePath, deactivateMissing = false, dryRun = false } = options;
  const targetPath = path.resolve(seedFilePath || config.SPORTS_SEED_FILE);
  logger.info({ targetPath, dryRun, deactivateMissing }, 'Reading sports seed data...');

  const rawData = await fs.readFile(targetPath, 'utf-8');
  const sportsData = JSON.parse(rawData);

  if (!Array.isArray(sportsData)) {
    throw new Error('Seed file must contain an array of sport objects');
  }

  let seededCount = 0;
  const seedKeys: string[] = [];

  for (const item of sportsData) {
    if (!item.key || !item.name) {
      logger.warn({ item }, 'Skipping invalid sport seed item (missing key or name)');
      continue;
    }

    const key = item.key.toLowerCase().trim();
    seedKeys.push(key);

    const updateDoc = {
      key,
      name: item.name.trim(),
      isActive: item.isActive !== undefined ? item.isActive : true,
      isTeamBased: item.isTeamBased !== undefined ? item.isTeamBased : false,
      allowsDraws: item.scoring?.allowsDraws !== undefined ? item.scoring.allowsDraws : (item.allowsDraws ?? false),
      formats: item.formats || [],
      scoring: item.scoring || { type: 'goals', allowsDraws: item.allowsDraws ?? false },
      movWeight: item.movWeight,
      minPlayers: item.minPlayers,
      maxPlayers: item.maxPlayers,
      skillBands: item.skillBands || [],
      playStyles: item.playStyles || [],
      positions: item.positions || [],
    };

    if (!dryRun) {
      await Sport.findOneAndUpdate(
        { key },
        updateDoc,
        { upsert: true, new: true },
      );
    }
    seededCount++;
  }

  let deactivatedCount = 0;
  if (deactivateMissing) {
    const missingSports = await Sport.find({
      key: { $nin: seedKeys },
      isActive: true,
    });

    deactivatedCount = missingSports.length;
    logger.info(
      { missingCount: deactivatedCount, missingKeys: missingSports.map((s) => s.key) },
      'Deactivating catalog sports absent from seed file',
    );

    if (!dryRun && deactivatedCount > 0) {
      await Sport.updateMany(
        { key: { $nin: seedKeys }, isActive: true },
        { $set: { isActive: false } },
      );
    }
  }

  logger.info(
    { seededCount, deactivatedCount, dryRun },
    'Successfully processed sports catalog seeding',
  );

  return { seededCount, deactivatedCount, dryRun };
}

// Standalone script execution
async function runCli(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const deactivateMissing = process.argv.includes('--deactivate-missing');

  try {
    logger.info(
      { isDryRun, deactivateMissing },
      'Connecting to MongoDB for sports catalog seeding...',
    );
    await mongoose.connect(config.MONGODB_URI);
    const result = await seedSportsCatalog({
      dryRun: isDryRun,
      deactivateMissing,
    });
    logger.info(
      { result },
      `Seeding finished cleanly: ${result.seededCount} sports processed, ${result.deactivatedCount} deactivated`,
    );
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
