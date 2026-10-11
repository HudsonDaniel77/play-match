import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { assertSafeLocalDatabase, DatabaseSafetyError, seedDemoData } from '../src/scripts/seed-demo.js';
import { User } from '../src/models/user.model.js';
import { Venue } from '../src/models/venue.model.js';
import { Game } from '../src/models/game.model.js';
import { MatchResult } from '../src/models/match-result.model.js';
import { Rating } from '../src/models/rating.model.js';
import { RatingEvent } from '../src/models/rating-event.model.js';
import { DemoConstants } from '../src/constants/demo-constants.js';

describe('Task 2: Demo Data Seed & Local Safety Enforcement', () => {
  describe('Safety Check: assertSafeLocalDatabase', () => {
    it('allows valid local hosts (localhost, 127.0.0.1, ::1, docker host)', () => {
      expect(() => assertSafeLocalDatabase('mongodb://localhost:27017/playmatch', 'development')).not.toThrow();
      expect(() => assertSafeLocalDatabase('mongodb://127.0.0.1:27017/playmatch', 'development')).not.toThrow();
      expect(() => assertSafeLocalDatabase('mongodb://[::1]:27017/playmatch', 'development')).not.toThrow();
      expect(() => assertSafeLocalDatabase('mongodb://mongo:27017/playmatch', 'development')).not.toThrow();
      expect(() => assertSafeLocalDatabase('mongodb://playmatch-mongo:27017/playmatch', 'development')).not.toThrow();
      expect(() => assertSafeLocalDatabase('mongodb://host.docker.internal:27017/playmatch', 'test')).not.toThrow();
    });

    it('always refuses mongodb+srv:// cloud URI scheme', () => {
      expect(() =>
        assertSafeLocalDatabase('mongodb+srv://user:pass@cluster0.9s7axjx.mongodb.net/playmatch', 'development'),
      ).toThrow(DatabaseSafetyError);
    });

    it('always refuses when NODE_ENV is production', () => {
      expect(() =>
        assertSafeLocalDatabase('mongodb://localhost:27017/playmatch', 'production'),
      ).toThrow(DatabaseSafetyError);
    });

    it('refuses multi-host URIs if any host is remote', () => {
      expect(() =>
        assertSafeLocalDatabase('mongodb://localhost:27017,remote.db.com:27017/playmatch', 'development'),
      ).toThrow(DatabaseSafetyError);
    });

    it('refuses external IP addresses or arbitrary domain names', () => {
      expect(() =>
        assertSafeLocalDatabase('mongodb://192.168.1.50:27017/playmatch', 'development'),
      ).toThrow(DatabaseSafetyError);
      expect(() =>
        assertSafeLocalDatabase('mongodb://my-vps.example.com:27017/playmatch', 'development'),
      ).toThrow(DatabaseSafetyError);
    });
  });

  describe('seedDemoData Execution & Idempotency', () => {
    it('successfully seeds demo data against in-memory replica set and populates ratings via engine', async () => {
      const uri = mongoose.connection.getClient().options.hosts?.[0]
        ? `mongodb://${mongoose.connection.getClient().options.hosts[0]}/playmatch`
        : 'mongodb://127.0.0.1:27017/playmatch';

      const result = await seedDemoData({
        mongoUri: uri,
        demoPassword: 'TestDemoPassword2026!Secure',
      });

      expect(result.adminEmail).toBe(DemoConstants.ADMIN_EMAIL);
      expect(result.venueOwnerEmail).toBe(DemoConstants.VENUE_OWNER_EMAIL);
      expect(result.playerCount).toBe(12);
      expect(result.venueCount).toBe(3);

      // Verify admin and owner in database
      const admin = await User.findOne({ email: DemoConstants.ADMIN_EMAIL });
      const owner = await User.findOne({ email: DemoConstants.VENUE_OWNER_EMAIL });
      expect(admin).not.toBeNull();
      expect(owner).not.toBeNull();

      // Verify venues exist
      const venues = await Venue.find({});
      expect(venues.length).toBeGreaterThanOrEqual(3);

      // Verify games exist and completed games exist
      const games = await Game.find({});
      expect(games.length).toBeGreaterThanOrEqual(5);

      const completedGames = await Game.find({ status: 'completed' });
      expect(completedGames.length).toBeGreaterThanOrEqual(3);

      // Verify match results and rating history populated via engine and tied to completed games
      const matchResults = await MatchResult.find({});
      expect(matchResults.length).toBeGreaterThanOrEqual(3);

      for (const mr of matchResults) {
        expect(mr.source.type).toBe('game');
        const tiedGame = await Game.findById(mr.source.id);
        expect(tiedGame).not.toBeNull();
        expect(tiedGame!.status).toBe('completed');
      }

      const ratingEvents = await RatingEvent.find({});
      expect(ratingEvents.length).toBeGreaterThanOrEqual(3);
    });

    it('is strictly idempotent: running seedDemoData twice produces no duplicates', async () => {
      const uri = mongoose.connection.getClient().options.hosts?.[0]
        ? `mongodb://${mongoose.connection.getClient().options.hosts[0]}/playmatch`
        : 'mongodb://127.0.0.1:27017/playmatch';

      // First run
      await seedDemoData({
        mongoUri: uri,
        demoPassword: 'TestDemoPassword2026!Secure',
      });

      const userCount1 = await User.countDocuments();
      const venueCount1 = await Venue.countDocuments();
      const gameCount1 = await Game.countDocuments();
      const matchCount1 = await MatchResult.countDocuments();

      // Second run (idempotent)
      await seedDemoData({
        mongoUri: uri,
        demoPassword: 'TestDemoPassword2026!Secure',
      });

      const userCount2 = await User.countDocuments();
      const venueCount2 = await Venue.countDocuments();
      const gameCount2 = await Game.countDocuments();
      const matchCount2 = await MatchResult.countDocuments();

      expect(userCount2).toBe(userCount1);
      expect(venueCount2).toBe(venueCount1);
      expect(gameCount2).toBe(gameCount1);
      expect(matchCount2).toBe(matchCount1);
    });
  });
});
