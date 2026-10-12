import mongoose, { Types } from 'mongoose';
import { User } from '../models/user.model.js';
import { Profile } from '../models/profile.model.js';
import { Sport } from '../models/sport.model.js';
import { SportProfile } from '../models/sport-profile.model.js';
import { Venue } from '../models/venue.model.js';
import { CourtGuard } from '../models/court-guard.model.js';
import { Game } from '../models/game.model.js';
import { GameParticipant } from '../models/game-participant.model.js';
import { Rating } from '../models/rating.model.js';
import { MatchResult } from '../models/match-result.model.js';
import { passwordService } from '../services/password.service.js';
import { seedSportsCatalog } from './seed-sports.js';
import { GameService } from '../services/game.service.js';
import { GameParticipantService } from '../services/game-participant.service.js';
import { ratingEngineService } from '../services/rating-engine.service.js';
import { VenueService } from '../services/venue.service.js';
import { Roles } from '../constants/roles.js';
import { UserStatuses } from '../constants/user-status.js';
import { VenueStatuses } from '../constants/venue-constants.js';
import { JoinPolicies, GameVisibilities, ParticipantStatuses, GameStatuses, CancellationReasonCodes } from '../constants/game-constants.js';
import { MatchSourceTypes } from '../constants/match-sources.js';
import { transitionGame } from '../services/game-transition.service.js';
import { DemoConstants } from '../constants/demo-constants.js';
import { defaultClock, TestClock } from '../utils/clock.js';
import { logger } from '../utils/logger.js';
import crypto from 'node:crypto';

export class DatabaseSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseSafetyError';
  }
}

/**
 * Asserts that a target MongoDB URI points only to local safe hosts and not production.
 * Must refuse BEFORE any connection attempt!
 */
export function assertSafeLocalDatabase(uri: string, nodeEnv?: string): void {
  if (nodeEnv === 'production') {
    throw new DatabaseSafetyError('SAFETY ERROR: Refusing to seed database when NODE_ENV is "production"!');
  }

  if (!uri || typeof uri !== 'string') {
    throw new DatabaseSafetyError('SAFETY ERROR: Empty or invalid MONGODB_URI provided');
  }

  const trimmed = uri.trim();

  // Always refuse mongodb+srv:// (Atlas and cloud-managed schemes)
  if (trimmed.startsWith('mongodb+srv://')) {
    throw new DatabaseSafetyError('SAFETY ERROR: Refusing connection with "mongodb+srv://" protocol! Local development only.');
  }

  if (!trimmed.startsWith('mongodb://')) {
    throw new DatabaseSafetyError('SAFETY ERROR: URI must use the standard "mongodb://" protocol.');
  }

  // Parse hosts
  // Standard format: mongodb://[user:pass@]host1[:port1][,host2[:port2]].../dbname[?options]
  const afterProto = trimmed.slice('mongodb://'.length);
  const withoutAuth = afterProto.includes('@') ? afterProto.split('@')[1]! : afterProto;
  const hostPart = withoutAuth.split('/')[0]!;
  const hosts = hostPart.split(',').map((h) => h.trim().toLowerCase());

  const ALLOWED_LOCAL_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    'mongo',
    'playmatch-mongo',
    'host.docker.internal',
  ]);

  for (const hostWithPort of hosts) {
    // Strip port or IPv6 brackets
    let hostName = hostWithPort;
    if (hostName.startsWith('[') && hostName.includes(']')) {
      hostName = hostName.slice(1, hostName.indexOf(']'));
    } else if (hostName.includes(':')) {
      hostName = hostName.split(':')[0]!;
    }

    if (!ALLOWED_LOCAL_HOSTS.has(hostName)) {
      throw new DatabaseSafetyError(
        `SAFETY ERROR: Host "${hostName}" is not on the local safe allowlist! Target must be local only.`,
      );
    }
  }
}

export interface SeedDemoOptions {
  reset?: boolean;
  demoPassword?: string;
  mongoUri?: string;
}

export interface SeedDemoResult {
  adminEmail: string;
  venueOwnerEmail: string;
  playerCount: number;
  venueCount: number;
  gameCount: number;
  demoPasswordPrinted: string;
}

export async function seedDemoData(options: SeedDemoOptions = {}): Promise<SeedDemoResult> {
  const uri = options.mongoUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/playmatch';
  const nodeEnv = process.env.NODE_ENV;

  // 1. SAFETY CHECK BEFORE CONNECTION
  assertSafeLocalDatabase(uri, nodeEnv);

  // Connect if not already connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // Handle --reset: drop only the named demo database
  if (options.reset) {
    logger.warn({ dbName: mongoose.connection.db?.databaseName }, 'Resetting demo database...');
    await mongoose.connection.db?.dropDatabase();
  }

  // Seed sports catalog first
  await seedSportsCatalog({ deactivateMissing: false });

  // Resolve demo password
  const demoPassword = options.demoPassword || process.env.DEMO_PASSWORD || crypto.randomBytes(12).toString('base64url') + '!Aa1';
  const passwordHash = await passwordService.hash(demoPassword);

  // 2. Create Admin and Venue Owner
  let admin = await User.findOne({ email: DemoConstants.ADMIN_EMAIL });
  if (!admin) {
    admin = await User.create({
      email: DemoConstants.ADMIN_EMAIL,
      passwordHash,
      name: 'Demo Admin',
      role: Roles.ADMIN,
      status: UserStatuses.ACTIVE,
      isEmailVerified: true,
    });
  }

  let owner = await User.findOne({ email: DemoConstants.VENUE_OWNER_EMAIL });
  if (!owner) {
    owner = await User.create({
      email: DemoConstants.VENUE_OWNER_EMAIL,
      passwordHash,
      name: 'Demo Venue Owner',
      role: Roles.VENUE_OWNER,
      status: UserStatuses.ACTIVE,
      isEmailVerified: true,
    });
  }

  // Ensure owner profile
  await Profile.findOneAndUpdate(
    { user: owner._id },
    {
      user: owner._id,
      displayName: 'Venue Master',
      homeLocation: { type: 'Point', coordinates: [DemoConstants.CITY.LONGITUDE, DemoConstants.CITY.LATITUDE] },
      onboarding: { isCompleted: true, completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'], completedAt: new Date() },
    },
    { upsert: true, new: true },
  );

  // 3. Create ~12 Players across catalog skill bands
  const badmintonSport = await Sport.findOne({ key: 'badminton' });
  const footballSport = await Sport.findOne({ key: 'football' });
  const cricketSport = await Sport.findOne({ key: 'cricket' });

  if (!badmintonSport || !footballSport || !cricketSport) {
    throw new Error('Sports catalog failed to load');
  }

  const catalogBands = ['beginner', 'intermediate', 'advanced', 'expert'];
  const players: any[] = [];

  for (let i = 1; i <= 12; i++) {
    const email = `${DemoConstants.PLAYER_EMAIL_PREFIX}${i}@${DemoConstants.DOMAIN}`;
    let player = await User.findOne({ email });
    if (!player) {
      player = await User.create({
        email,
        passwordHash,
        name: `Demo Player ${i}`,
        role: Roles.PLAYER,
        status: UserStatuses.ACTIVE,
        isEmailVerified: true,
      });
    }
    players.push(player);

    // Spread coordinates slightly around demo city
    const offsetLng = DemoConstants.CITY.LONGITUDE + ((i % 4) - 1.5) * 0.02;
    const offsetLat = DemoConstants.CITY.LATITUDE + (Math.floor(i / 4) - 1) * 0.02;

    await Profile.findOneAndUpdate(
      { user: player._id },
      {
        user: player._id,
        displayName: `Player ${i}`,
        homeLocation: { type: 'Point', coordinates: [offsetLng, offsetLat] },
        travelRadiusKm: 15,
        visibility: { location: i === 12 ? 'hidden' : 'coarsened' },
        availability: [
          { dayOfWeek: 1, startMinute: 480, endMinute: 1200 },
          { dayOfWeek: 3, startMinute: 480, endMinute: 1200 },
          { dayOfWeek: 5, startMinute: 480, endMinute: 1200 },
          { dayOfWeek: 6, startMinute: 420, endMinute: 1320 },
          { dayOfWeek: 0, startMinute: 420, endMinute: 1320 },
        ],
        onboarding: { isCompleted: true, completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'], completedAt: new Date() },
      },
      { upsert: true },
    );

    // Assign sports, bands, and initialize Rating document
    const bandKey = catalogBands[(i - 1) % catalogBands.length]!;
    for (const s of [badmintonSport, footballSport, cricketSport]) {
      const selectedBand = s.skillBands.find((b) => b.key === bandKey) || s.skillBands[0]!;
      await SportProfile.findOneAndUpdate(
        { user: player._id, sport: s._id },
        { user: player._id, sport: s._id, selectedBandKey: selectedBand.key, isBandLocked: true, isActive: true },
        { upsert: true },
      );

      const existingRating = await Rating.findOne({ user: player._id, sport: s._id });
      if (!existingRating) {
        await Rating.create({
          user: player._id,
          sport: s._id,
          rating: selectedBand.seedRating,
          peakRating: selectedBand.seedRating,
          seedRating: selectedBand.seedRating,
          seedBandKey: selectedBand.key,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
        });
      }
    }
  }

  // 4. Create Venues with Courts, Hours, Closures
  let venue1: any = await Venue.findOne({ name: 'Marina Smash Arena' });
  if (!venue1) {
    venue1 = await VenueService.createVenue(
      owner._id,
      {
        name: 'Marina Smash Arena',
        description: 'Premier multi-sport arena near Marina Beach with synthetic courts.',
        address: { line1: '42 Beach Road', city: DemoConstants.CITY.NAME, state: DemoConstants.CITY.STATE },
        areaLabel: 'Marina Beach',
        location: { type: 'Point', coordinates: [80.2800, 13.0600] },
        timezone: DemoConstants.CITY.TIMEZONE,
        weeklyHours: Array.from({ length: 7 }, (_, day) => ({ dayOfWeek: day, openMinute: 0, closeMinute: 1440 })),
        courts: [
          { name: 'Badminton Court 1', sportKeys: ['badminton'], isActive: true },
          { name: 'Badminton Court 2', sportKeys: ['badminton'], isActive: true },
          { name: 'Football 5s Turf', sportKeys: ['football'], isActive: true },
        ],
      },
      'venue_owner',
    );
    // Approve venue
    await VenueService.approveVenue(venue1._id, admin._id);
    venue1 = (await Venue.findById(venue1._id))!;
  }

  let venue2: any = await Venue.findOne({ name: 'Chepauk Turf Grounds' });
  if (!venue2) {
    venue2 = await VenueService.createVenue(
      owner._id,
      {
        name: 'Chepauk Turf Grounds',
        description: 'Box cricket and football turf pitches with floodlights.',
        address: { line1: '10 Wallajah Road', city: DemoConstants.CITY.NAME, state: DemoConstants.CITY.STATE },
        areaLabel: 'Chepauk',
        location: { type: 'Point', coordinates: [80.2780, 13.0630] },
        timezone: DemoConstants.CITY.TIMEZONE,
        weeklyHours: Array.from({ length: 7 }, (_, day) => ({ dayOfWeek: day, openMinute: 0, closeMinute: 1440 })),
        courts: [
          { name: 'Cricket Net A', sportKeys: ['cricket'], isActive: true },
          { name: 'Cricket Box Turf', sportKeys: ['cricket'], isActive: true },
        ],
      },
      'venue_owner',
    );
    await VenueService.approveVenue(venue2._id, admin._id);
    venue2 = (await Venue.findById(venue2._id))!;
  }

  let venue3: any = await Venue.findOne({ name: 'Anna Nagar Sports Complex (Pending)' });
  if (!venue3) {
    venue3 = await VenueService.createVenue(
      owner._id,
      {
        name: 'Anna Nagar Sports Complex (Pending)',
        description: 'New indoor sports facility awaiting admin verification.',
        address: { line1: '2nd Avenue', city: DemoConstants.CITY.NAME, state: DemoConstants.CITY.STATE },
        areaLabel: 'Anna Nagar',
        location: { type: 'Point', coordinates: [80.2100, 13.0850] },
        timezone: DemoConstants.CITY.TIMEZONE,
        weeklyHours: Array.from({ length: 7 }, (_, day) => ({ dayOfWeek: day, openMinute: 0, closeMinute: 1440 })),
        courts: [{ name: 'Court Alpha', sportKeys: ['badminton'], isActive: true }],
      },
      'venue_owner',
    );
    // Remains in PENDING_APPROVAL status
  }

  // 5. Create ~10 Games in various lifecycle states through real services
  const now = Date.now();
  const createdGames: any[] = [];

  // Helper to ensure court guards exist
  for (const v of [venue1, venue2, venue3]) {
    for (const c of v.courts) {
      await CourtGuard.findOneAndUpdate(
        { venueId: v._id, courtId: c.courtId },
        { venueId: v._id, courtId: c.courtId, $setOnInsert: { version: 0 } },
        { upsert: true },
      );
    }
  }

  // Game 1: OPEN badminton at venue1
  const g1Start = new Date(now + 24 * 3600 * 1000);
  const g1End = new Date(g1Start.getTime() + 60 * 60 * 1000);
  let g1: any = await Game.findOne({ notes: 'Demo Open Game 1' });
  if (!g1) {
    g1 = await GameService.createGame(players[0]!._id, {
      sportKey: 'badminton',
      formatKey: 'singles',
      startsAt: g1Start,
      endsAt: g1End,
      venueId: venue1._id,
      courtId: venue1.courts[0]?.courtId,
      joinPolicy: JoinPolicies.OPEN,
      visibility: GameVisibilities.PUBLIC,
      notes: 'Demo Open Game 1',
    });
  }
  createdGames.push(g1);

  // Game 2: OPEN football with 3 joined players
  const g2Start = new Date(now + 30 * 3600 * 1000);
  const g2End = new Date(g2Start.getTime() + 60 * 60 * 1000);
  let g2 = await Game.findOne({ notes: 'Demo Open Game 2' });
  if (!g2) {
    const rawG2 = await GameService.createGame(players[1]!._id, {
      sportKey: 'football',
      formatKey: '5_a_side',
      startsAt: g2Start,
      endsAt: g2End,
      venueId: venue1._id,
      courtId: venue1.courts[2]?.courtId,
      joinPolicy: JoinPolicies.OPEN,
      visibility: GameVisibilities.PUBLIC,
      notes: 'Demo Open Game 2',
    });
    const g2Id = (rawG2 as any)._id || (rawG2 as any).id;
    g2 = (await Game.findById(g2Id))!;
    // Join players 2 and 3: joinGame(userId, gameId)
    await GameParticipantService.joinGame(players[2]!._id, g2._id);
    await GameParticipantService.joinGame(players[3]!._id, g2._id);
  }
  createdGames.push(g2);

  // Game 3: OPEN with approval join policy
  const g3Start = new Date(now + 48 * 3600 * 1000);
  const g3End = new Date(g3Start.getTime() + 60 * 60 * 1000);
  let g3 = await Game.findOne({ notes: 'Demo Approval Game' });
  if (!g3) {
    const rawG3 = await GameService.createGame(players[2]!._id, {
      sportKey: 'cricket',
      formatKey: '6_a_side',
      startsAt: g3Start,
      endsAt: g3End,
      venueId: venue2._id,
      courtId: venue2.courts[0]?.courtId,
      joinPolicy: JoinPolicies.APPROVAL,
      visibility: GameVisibilities.PUBLIC,
      notes: 'Demo Approval Game',
    });
    const g3Id = (rawG3 as any)._id || (rawG3 as any).id;
    g3 = (await Game.findById(g3Id))!;
    // Player 4 requests to join
    await GameParticipantService.joinGame(players[4]!._id, g3._id);
  }
  createdGames.push(g3);

  // Game 4: FULL doubles badminton with waitlist
  const g4Start = new Date(now + 36 * 3600 * 1000);
  const g4End = new Date(g4Start.getTime() + 60 * 60 * 1000);
  let g4 = await Game.findOne({ notes: 'Demo Full Game with Waitlist' });
  if (!g4) {
    const rawG4 = await GameService.createGame(players[3]!._id, {
      sportKey: 'badminton',
      formatKey: 'doubles', // max 4 players
      startsAt: g4Start,
      endsAt: g4End,
      location: { type: 'Point', coordinates: [80.2600, 13.0700] },
      courtName: 'Community Center Court',
      joinPolicy: JoinPolicies.OPEN,
      visibility: GameVisibilities.PUBLIC,
      notes: 'Demo Full Game with Waitlist',
    });
    const g4Id = (rawG4 as any)._id || (rawG4 as any).id;
    g4 = (await Game.findById(g4Id))!;
    // Fill to 4 players
    await GameParticipantService.joinGame(players[4]!._id, g4._id);
    await GameParticipantService.joinGame(players[5]!._id, g4._id);
    await GameParticipantService.joinGame(players[6]!._id, g4._id);
    // 5th player goes to waitlist
    await GameParticipantService.joinGame(players[7]!._id, g4._id);
  }
  createdGames.push(g4);

  // Game 5: CONFIRMED badminton game
  const g5Start = new Date(now + 12 * 3600 * 1000);
  const g5End = new Date(g5Start.getTime() + 60 * 60 * 1000);
  let g5 = await Game.findOne({ notes: 'Demo Confirmed Game' });
  if (!g5) {
    const rawG5 = await GameService.createGame(players[0]!._id, {
      sportKey: 'badminton',
      formatKey: 'singles',
      startsAt: g5Start,
      endsAt: g5End,
      venueId: venue1._id,
      courtId: venue1.courts[1]?.courtId,
      joinPolicy: JoinPolicies.OPEN,
      visibility: GameVisibilities.PUBLIC,
      notes: 'Demo Confirmed Game',
    });
    const g5Id = (rawG5 as any)._id || (rawG5 as any).id;
    g5 = (await Game.findById(g5Id))!;
    await GameParticipantService.joinGame(players[1]!._id, g5._id);
    // Host confirms the game via state machine transition
    await transitionGame(g5, {
      toStatus: GameStatuses.CONFIRMED,
      actorId: players[0]!._id,
      actorRole: 'host',
      reason: 'Host confirmed game roster',
    });
  }
  createdGames.push(g5);

  // Game 6: CANCELLED game
  const g6Start = new Date(now + 60 * 3600 * 1000);
  const g6End = new Date(g6Start.getTime() + 60 * 60 * 1000);
  let g6 = await Game.findOne({ notes: 'Demo Cancelled Game' });
  if (!g6) {
    const rawG6 = await GameService.createGame(players[5]!._id, {
      sportKey: 'badminton',
      formatKey: 'singles',
      startsAt: g6Start,
      endsAt: g6End,
      location: { type: 'Point', coordinates: [80.2700, 13.0800] },
      notes: 'Demo Cancelled Game',
    });
    const g6Id = (rawG6 as any)._id || (rawG6 as any).id;
    g6 = (await Game.findById(g6Id))!;
    await GameService.cancelGame(g6._id, players[5]!._id, {
      reasonCode: CancellationReasonCodes.WEATHER,
      reasonText: 'Unforeseen rain forecast',
    });
  }
  createdGames.push(g6);

  // 6. COMPLETED Games created via services and state machine, then tied to Match Results
  // Helper to create and complete a game in the past using a TestClock
  async function createCompletedPastGame(
    gameHost: any,
    joinedPlayers: any[],
    startTime: Date,
    endTime: Date,
    gameNotes: string,
    courtInfo?: { venueId: any; courtId: string },
  ) {
    let existingGame: any = await Game.findOne({ notes: gameNotes });
    if (!existingGame) {
      // Create clock set prior to game start so lead time validation passes
      const creationClock = new TestClock(startTime.getTime() - 2 * 3600 * 1000);
      existingGame = await GameService.createGame(
        gameHost._id,
        {
          sportKey: 'badminton',
          formatKey: 'doubles',
          startsAt: startTime,
          endsAt: endTime,
          venueId: courtInfo?.venueId,
          courtId: courtInfo?.courtId,
          location: courtInfo ? undefined : { type: 'Point', coordinates: [80.2500, 13.0500] },
          courtName: courtInfo ? undefined : 'Marina Recreation Center',
          joinPolicy: JoinPolicies.OPEN,
          visibility: GameVisibilities.PUBLIC,
          notes: gameNotes,
        },
        creationClock,
      );

      // Join the other 3 players
      for (const p of joinedPlayers) {
        await GameParticipantService.joinGame(p._id, existingGame._id, creationClock);
      }

      // Transition game: CONFIRMED -> IN_PROGRESS -> COMPLETED
      const hostActorId = gameHost._id;
      const startClock = new TestClock(startTime.getTime() + 5 * 60 * 1000);
      await transitionGame(existingGame, {
        toStatus: GameStatuses.CONFIRMED,
        actorId: hostActorId,
        actorRole: 'host',
        reason: 'Roster filled and confirmed',
        clock: creationClock,
      });

      await transitionGame(existingGame, {
        toStatus: GameStatuses.IN_PROGRESS,
        actorId: hostActorId,
        actorRole: 'host',
        reason: 'Match in progress',
        clock: startClock,
      });

      const endClock = new TestClock(endTime.getTime());
      await transitionGame(existingGame, {
        toStatus: GameStatuses.COMPLETED,
        actorId: hostActorId,
        actorRole: 'host',
        reason: 'Match concluded',
        clock: endClock,
      });
    }
    return existingGame;
  }

  // Past Game 1: 3 days ago
  const pg1Start = new Date(now - 72 * 3600 * 1000);
  const pg1End = new Date(pg1Start.getTime() + 60 * 60 * 1000);
  const pastGame1 = await createCompletedPastGame(
    players[0]!,
    [players[1]!, players[2]!, players[3]!],
    pg1Start,
    pg1End,
    'Demo Completed Badminton Game 1',
    { venueId: venue1._id, courtId: venue1.courts[0]?.courtId },
  );
  createdGames.push(pastGame1);

  const existingMatch1 = await MatchResult.findOne({ 'source.id': pastGame1._id.toString() });
  if (!existingMatch1) {
    await ratingEngineService.applyMatchResult(
      {
        sportKey: 'badminton',
        source: {
          type: MatchSourceTypes.GAME,
          id: pastGame1._id.toString(),
        },
        sides: [
          {
            sideKey: 'side_a',
            playerIds: [players[0]!._id.toString(), players[1]!._id.toString()],
            score: 2,
          },
          {
            sideKey: 'side_b',
            playerIds: [players[2]!._id.toString(), players[3]!._id.toString()],
            score: 1,
          },
        ],
      },
      admin._id.toString(),
    );
  }

  // Past Game 2: 2 days ago
  const pg2Start = new Date(now - 48 * 3600 * 1000);
  const pg2End = new Date(pg2Start.getTime() + 60 * 60 * 1000);
  const pastGame2 = await createCompletedPastGame(
    players[4]!,
    [players[5]!, players[6]!, players[7]!],
    pg2Start,
    pg2End,
    'Demo Completed Badminton Game 2',
    { venueId: venue1._id, courtId: venue1.courts[1]?.courtId },
  );
  createdGames.push(pastGame2);

  const existingMatch2 = await MatchResult.findOne({ 'source.id': pastGame2._id.toString() });
  if (!existingMatch2) {
    await ratingEngineService.applyMatchResult(
      {
        sportKey: 'badminton',
        source: {
          type: MatchSourceTypes.GAME,
          id: pastGame2._id.toString(),
        },
        sides: [
          {
            sideKey: 'team_alpha',
            playerIds: [players[4]!._id.toString(), players[5]!._id.toString()],
            score: 2,
          },
          {
            sideKey: 'team_beta',
            playerIds: [players[6]!._id.toString(), players[7]!._id.toString()],
            score: 0,
          },
        ],
      },
      admin._id.toString(),
    );
  }

  // Past Game 3: 1 day ago
  const pg3Start = new Date(now - 24 * 3600 * 1000);
  const pg3End = new Date(pg3Start.getTime() + 60 * 60 * 1000);
  const pastGame3 = await createCompletedPastGame(
    players[8]!,
    [players[9]!, players[10]!, players[11]!],
    pg3Start,
    pg3End,
    'Demo Completed Badminton Game 3',
  );
  createdGames.push(pastGame3);

  const existingMatch3 = await MatchResult.findOne({ 'source.id': pastGame3._id.toString() });
  if (!existingMatch3) {
    await ratingEngineService.applyMatchResult(
      {
        sportKey: 'badminton',
        source: {
          type: MatchSourceTypes.GAME,
          id: pastGame3._id.toString(),
        },
        sides: [
          {
            sideKey: 'kings',
            playerIds: [players[8]!._id.toString(), players[9]!._id.toString()],
            score: 2,
          },
          {
            sideKey: 'royals',
            playerIds: [players[10]!._id.toString(), players[11]!._id.toString()],
            score: 1,
          },
        ],
      },
      admin._id.toString(),
    );
  }

  logger.info(
    {
      admin: DemoConstants.ADMIN_EMAIL,
      owner: DemoConstants.VENUE_OWNER_EMAIL,
      playerCount: players.length,
      venueCount: 3,
    },
    'Demo data seeded successfully!',
  );

  return {
    adminEmail: DemoConstants.ADMIN_EMAIL,
    venueOwnerEmail: DemoConstants.VENUE_OWNER_EMAIL,
    playerCount: players.length,
    venueCount: 3,
    gameCount: createdGames.length,
    demoPasswordPrinted: demoPassword,
  };
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Direct execution CLI entrypoint
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const isReset = process.argv.includes('--reset');
  seedDemoData({ reset: isReset })
    .then((result) => {
      console.log('========================================================');
      console.log('✅ PLAYMATCH DEMO DATA SEEDED SUCCESSFULLY');
      console.log('========================================================');
      console.log(`Admin User:       ${result.adminEmail}`);
      console.log(`Venue Owner:      ${result.venueOwnerEmail}`);
      console.log(`Demo Players:     player1@${DemoConstants.DOMAIN} to player12@${DemoConstants.DOMAIN}`);
      console.log(`Demo Password:    ${result.demoPasswordPrinted}`);
      console.log('========================================================');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ SEEDING FAILED:', err.message);
      process.exit(1);
    });
}
