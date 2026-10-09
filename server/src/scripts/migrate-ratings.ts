import mongoose from 'mongoose';
import { Rating } from '../models/rating.model.js';
import { Collections } from '../constants/collections.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface MigrationSummary {
  scannedCount: number;
  updatedCount: number;
  dryRun: boolean;
}

export async function runRatingsMigration(dryRun = false): Promise<MigrationSummary> {
  logger.info({ dryRun }, 'Starting Rating documents migration...');

  // Identify Rating documents lacking Module 3 fields
  const filter = {
    $or: [
      { peakRating: { $exists: false } },
      { wins: { $exists: false } },
      { losses: { $exists: false } },
      { draws: { $exists: false } },
      { lastRatedAt: { $exists: false } },
    ],
  };

  const rawCollection = mongoose.connection.collection(Collections.RATINGS);
  const candidateDocs = await rawCollection.find(filter).toArray();
  const scannedCount = candidateDocs.length;

  logger.info(
    { scannedCount, dryRun },
    `Found ${scannedCount} Rating document(s) requiring backfill`,
  );

  if (dryRun || scannedCount === 0) {
    logger.info(
      { scannedCount, updatedCount: 0, dryRun },
      'Dry-run completed or no documents require update. No changes committed.',
    );
    return { scannedCount, updatedCount: 0, dryRun: true };
  }

  let updatedCount = 0;
  for (const doc of candidateDocs) {
    const updates: Record<string, unknown> = {};

    if (doc.peakRating === undefined) {
      updates.peakRating = doc.rating;
    }
    if (doc.wins === undefined) {
      updates.wins = 0;
    }
    if (doc.losses === undefined) {
      updates.losses = 0;
    }
    if (doc.draws === undefined) {
      updates.draws = 0;
    }
    if (doc.lastRatedAt === undefined) {
      updates.lastRatedAt = null;
    }

    if (Object.keys(updates).length > 0) {
      await rawCollection.updateOne({ _id: doc._id }, { $set: updates });
      updatedCount++;
    }
  }

  logger.info(
    { scannedCount, updatedCount, dryRun: false },
    `Successfully migrated ${updatedCount} Rating document(s)`,
  );

  return { scannedCount, updatedCount, dryRun: false };
}

// Standalone execution wrapper
async function runCli(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  try {
    logger.info('Connecting to MongoDB for ratings migration...');
    await mongoose.connect(config.MONGODB_URI);
    const summary = await runRatingsMigration(isDryRun);
    logger.info({ summary }, 'Migration execution finished cleanly');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Migration execution failed with error');
    await mongoose.connection.close();
    process.exit(1);
  }
}

if (
  process.argv[1]?.endsWith('migrate-ratings.ts') ||
  process.argv[1]?.endsWith('migrate-ratings.js')
) {
  runCli();
}
