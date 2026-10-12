import { describe, it, expect, beforeEach } from 'vitest';
import { GameStatuses, ParticipantStatuses } from '../src/constants/game-constants.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { Game } from '../src/models/game.model.js';
import { GameParticipant } from '../src/models/game-participant.model.js';
import { TestClock } from '../src/utils/clock.js';
import { runLifecycleSweep } from '../src/services/game-sweep.service.js';

describe('Module 4: Background Lifecycle Sweep', () => {
  let hostUser: any;
  let playerUser: any;
  let testSport: any;

  beforeEach(async () => {
    const host = await createTestUser();
    hostUser = host.user;

    const p = await createTestUser();
    playerUser = p.user;

    testSport = await createTestSport({ key: 'badminton', name: 'Badminton' });
  });

  it('auto-confirms game meeting minimum even roster when sweep runs at cutoff', async () => {
    const baseTime = new Date('2026-06-01T12:00:00.000Z');
    const clock = new TestClock(baseTime);

    // Starts at 12:10 (10 minutes from now, within 15 minute cutoff)
    const startsAt = new Date(baseTime.getTime() + 10 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const game = await Game.create({
      hostId: hostUser.id,
      sportKey: 'badminton',
      formatKey: 'singles',
      status: GameStatuses.OPEN,
      minPlayers: 2,
      maxPlayers: 2,
      participantCount: 2, // Even count (2), meets minPlayers (2)
      startsAt,
      endsAt,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });

    const summary = await runLifecycleSweep(clock);
    expect(summary.confirmedCount).toBe(1);

    const updated = await Game.findById(game.id);
    expect(updated?.status).toBe(GameStatuses.CONFIRMED);
  });

  it('expires game failing minimum roster criteria when sweep runs at cutoff', async () => {
    const baseTime = new Date('2026-06-01T12:00:00.000Z');
    const clock = new TestClock(baseTime);

    const startsAt = new Date(baseTime.getTime() + 10 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const game = await Game.create({
      hostId: hostUser.id,
      sportKey: 'badminton',
      formatKey: 'singles',
      status: GameStatuses.OPEN,
      minPlayers: 2,
      maxPlayers: 2,
      participantCount: 1, // Only 1 player (< minPlayers)
      startsAt,
      endsAt,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });

    const summary = await runLifecycleSweep(clock);
    expect(summary.expiredCount).toBe(1);

    const updated = await Game.findById(game.id);
    expect(updated?.status).toBe(GameStatuses.EXPIRED);
  });

  it('transitions confirmed game to in_progress and then to completed as time progresses', async () => {
    const baseTime = new Date('2026-06-01T12:00:00.000Z');
    const clock = new TestClock(baseTime);

    const startsAt = new Date(baseTime.getTime() + 10 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const game = await Game.create({
      hostId: hostUser.id,
      sportKey: 'badminton',
      formatKey: 'singles',
      status: GameStatuses.CONFIRMED,
      minPlayers: 2,
      maxPlayers: 2,
      participantCount: 2,
      startsAt,
      endsAt,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });

    // Advance clock past startsAt + grace (10m + 5m grace = 15m)
    clock.advanceByMinutes(16);

    const startSummary = await runLifecycleSweep(clock);
    expect(startSummary.inProgressCount).toBe(1);

    const inProgGame = await Game.findById(game.id);
    expect(inProgGame?.status).toBe(GameStatuses.IN_PROGRESS);

    // Advance clock past endsAt + delay (60m duration + 30m delay = 90m total)
    clock.advanceByMinutes(90);

    const completeSummary = await runLifecycleSweep(clock);
    expect(completeSummary.completedCount).toBe(1);

    const completedGame = await Game.findById(game.id);
    expect(completedGame?.status).toBe(GameStatuses.COMPLETED);
  });
});
