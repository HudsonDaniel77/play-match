import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Rating } from '../src/models/rating.model.js';
import { runRatingsMigration } from '../src/scripts/migrate-ratings.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';

describe('Ratings Migration Script Tests', () => {
  it('supports dry-run mode and performs idempotent backfills', async () => {
    const { user: user1 } = await createTestUser();
    const { user: user2 } = await createTestUser();
    const sport = await createTestSport();

    // Directly insert legacy Rating documents missing Module 3 fields using raw collection to bypass Mongoose defaults
    const rawCollection = mongoose.connection.collection('ratings');
    await rawCollection.insertMany([
      {
        user: user1._id,
        sport: sport._id,
        rating: 1250,
        seedRating: 1200,
        seedBandKey: 'intermediate',
        gamesPlayed: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        user: user2._id,
        sport: sport._id,
        rating: 1400,
        seedRating: 1200,
        seedBandKey: 'advanced',
        gamesPlayed: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 1. Dry run execution
    const dryRunRes = await runRatingsMigration(true);
    expect(dryRunRes.dryRun).toBe(true);
    expect(dryRunRes.scannedCount).toBe(2);
    expect(dryRunRes.updatedCount).toBe(0);

    // Verify raw documents still lack Module 3 fields
    const rawAfterDry = await rawCollection.findOne({ user: user1._id });
    expect(rawAfterDry?.peakRating).toBeUndefined();

    // 2. Actual migration execution
    const actualRes = await runRatingsMigration(false);
    expect(actualRes.dryRun).toBe(false);
    expect(actualRes.scannedCount).toBe(2);
    expect(actualRes.updatedCount).toBe(2);

    // Verify fields were backfilled
    const rawAfterMigration1 = await rawCollection.findOne({ user: user1._id });
    expect(rawAfterMigration1?.peakRating).toBe(1250);
    expect(rawAfterMigration1?.wins).toBe(0);
    expect(rawAfterMigration1?.losses).toBe(0);
    expect(rawAfterMigration1?.draws).toBe(0);
    expect(rawAfterMigration1?.lastRatedAt).toBeNull();

    const rawAfterMigration2 = await rawCollection.findOne({ user: user2._id });
    expect(rawAfterMigration2?.peakRating).toBe(1400);

    // 3. Re-run migration (Idempotency test)
    const rerunRes = await runRatingsMigration(false);
    expect(rerunRes.scannedCount).toBe(0);
    expect(rerunRes.updatedCount).toBe(0);
  });
});
