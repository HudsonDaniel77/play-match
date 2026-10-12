import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';
import { ErrorCodes } from '../src/constants/error-codes.js';
import {
  GameStatuses,
  JoinPolicies,
  GameVisibilities,
  CancellationReasonCodes,
} from '../src/constants/game-constants.js';
import { Roles } from '../src/constants/roles.js';
import { tokenService } from '../src/services/token.service.js';
import { createTestUser } from './fixtures/user.fixture.js';
import { createTestSport } from './fixtures/sport.fixture.js';
import { SportProfile } from '../src/models/sport-profile.model.js';
import { Profile } from '../src/models/profile.model.js';
import { Game } from '../src/models/game.model.js';
import { GameEvent } from '../src/models/game-event.model.js';
import { OnboardingStatuses } from '../src/constants/onboarding-steps.js';

describe('Module 4: Explicit Specific Checks Requested by User', () => {
  let hostUser: any;
  let hostToken: string;
  let player1: any;
  let player1Token: string;
  let player2: any;
  let player2Token: string;
  let adminUser: any;
  let adminToken: string;
  let testSport: any;

  beforeEach(async () => {
    const host = await createTestUser({ role: Roles.PLAYER });
    hostUser = host.user;
    hostToken = tokenService.generateAccessToken({
      userId: hostUser.id,
      role: hostUser.role,
      email: hostUser.email,
    });

    const p1 = await createTestUser({ role: Roles.PLAYER });
    player1 = p1.user;
    player1Token = tokenService.generateAccessToken({
      userId: player1.id,
      role: player1.role,
      email: player1.email,
    });

    const p2 = await createTestUser({ role: Roles.PLAYER });
    player2 = p2.user;
    player2Token = tokenService.generateAccessToken({
      userId: player2.id,
      role: player2.role,
      email: player2.email,
    });

    const admin = await createTestUser({ role: Roles.ADMIN });
    adminUser = admin.user;
    adminToken = tokenService.generateAccessToken({
      userId: adminUser.id,
      role: adminUser.role,
      email: adminUser.email,
    });

    testSport = await createTestSport({
      key: 'badminton',
      name: 'Badminton',
    });

    for (const u of [hostUser, player1, player2, adminUser]) {
      await Profile.create({
        user: u.id,
        displayName: u.name,
        bio: 'Bio',
        homeLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
        travelRadiusKm: 15,
        availability: [{ dayOfWeek: 1, startMinute: 600, endMinute: 720 }],
        visibility: { profile: 'public', location: 'coarsened', ratings: 'public' },
        onboarding: {
          status: OnboardingStatuses.COMPLETED,
          completedSteps: ['basic', 'sports', 'availability', 'location', 'preferences'],
          completedAt: new Date(),
        },
      });

      await SportProfile.create({
        user: u.id,
        sport: testSport._id,
        selectedBandKey: 'intermediate',
        isActive: true,
      });
    }
  });

  it('Check 1: join-by-code request keeps exact location hidden until joined', async () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    // Host creates private game with inviteCode
    const createRes = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: {
          type: 'Point',
          coordinates: [77.594582, 12.971598],
          addressName: 'Secret Clubhouse Court 9',
        },
        courtName: 'Court 9 VIP',
        visibility: GameVisibilities.PRIVATE,
      });

    const inviteCode = createRes.body.data.inviteCode;
    const gameId = createRes.body.data.id;

    // 1. Unjoined player views game via invite code: exact location must be coarsened and courtName hidden
    const previewRes = await request(app)
      .get(`/api/v1/games/code/${inviteCode}`)
      .set('Authorization', `Bearer ${player1Token}`);

    expect(previewRes.status).toBe(HttpStatus.OK);
    expect(previewRes.body.data.location.coordinates[0]).toBe(77.59);
    expect(previewRes.body.data.location.coordinates[1]).toBe(12.97);
    expect(previewRes.body.data.courtName).toBeUndefined();
    expect(previewRes.body.data.location.addressName).toBeUndefined();

    // 2. Player joins the game
    const joinRes = await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);
    expect(joinRes.status).toBe(HttpStatus.OK);

    // 3. Now joined, player views game details: exact location and courtName are visible!
    const joinedViewRes = await request(app)
      .get(`/api/v1/games/${gameId}`)
      .set('Authorization', `Bearer ${player1Token}`);

    expect(joinedViewRes.status).toBe(HttpStatus.OK);
    expect(joinedViewRes.body.data.courtName).toBe('Court 9 VIP');
    expect(joinedViewRes.body.data.location.addressName).toBe('Secret Clubhouse Court 9');
    expect(joinedViewRes.body.data.location.coordinates).toEqual([77.594582, 12.971598]);
  });

  it('Check 2: admin cancel succeeds, but non-host attempts to edit or remove are rejected (403)', async () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const createRes = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      });

    const gameId = createRes.body.data.id;

    // Player 1 joins
    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    // Non-host (player1) attempts to edit game notes -> REJECTED 403
    const nonHostEditRes = await request(app)
      .patch(`/api/v1/games/${gameId}`)
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ notes: 'Hacked notes' });

    expect(nonHostEditRes.status).toBe(HttpStatus.FORBIDDEN);
    expect(nonHostEditRes.body.error.code).toBe(ErrorCodes.FORBIDDEN_ACCESS);

    // Non-host (player1) attempts to remove host -> REJECTED 403
    const nonHostRemoveRes = await request(app)
      .delete(`/api/v1/games/${gameId}/participants/${hostUser.id}`)
      .set('Authorization', `Bearer ${player1Token}`);

    expect(nonHostRemoveRes.status).toBe(HttpStatus.FORBIDDEN);
    expect(nonHostRemoveRes.body.error.code).toBe(ErrorCodes.FORBIDDEN_ACCESS);

    // Admin cancel succeeds!
    const adminCancelRes = await request(app)
      .post(`/api/v1/games/${gameId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reasonCode: CancellationReasonCodes.ADMIN_ACTION,
        reasonText: 'Cancelled by system admin',
      });

    expect(adminCancelRes.status).toBe(HttpStatus.OK);
    expect(adminCancelRes.body.data.status).toBe(GameStatuses.CANCELLED);

    const dbGame = await Game.findById(gameId);
    expect(dbGame?.status).toBe(GameStatuses.CANCELLED);
    expect(dbGame?.cancellation?.reasonCode).toBe(CancellationReasonCodes.ADMIN_ACTION);
  });

  it('Check 3: /games/:id/events shows exactly one event per action (join, leave, promotion, cancel)', async () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    // 1. Create game (Event: game_created)
    const createRes = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles', // maxPlayers = 2
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      });
    const gameId = createRes.body.data.id;

    // 2. Player 1 joins (Takes final seat, status changes to FULL: participant_joined, status_changed)
    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    // 3. Player 2 joins (Gets waitlisted: participant_waitlisted)
    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player2Token}`);

    // 4. Player 1 leaves (Triggers promotion of Player 2: participant_left, participant_promoted)
    await request(app)
      .post(`/api/v1/games/${gameId}/leave`)
      .set('Authorization', `Bearer ${player1Token}`);

    // 5. Host cancels (game_cancelled)
    await request(app)
      .post(`/api/v1/games/${gameId}/cancel`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ reasonCode: CancellationReasonCodes.HOST_CANCELLED });

    // Inspect /games/:id/events
    const eventsRes = await request(app)
      .get(`/api/v1/games/${gameId}/events`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(eventsRes.status).toBe(HttpStatus.OK);
    const events = eventsRes.body.data;
    const eventTypes = events.map((e: any) => e.type);

    // Exactly one event of each specific action type:
    expect(eventTypes.filter((t: string) => t === 'game_created').length).toBe(1);
    expect(eventTypes.filter((t: string) => t === 'participant_joined').length).toBe(1);
    expect(eventTypes.filter((t: string) => t === 'participant_waitlisted').length).toBe(1);
    expect(eventTypes.filter((t: string) => t === 'participant_left').length).toBe(1);
    expect(eventTypes.filter((t: string) => t === 'participant_promoted').length).toBe(1);
    expect(eventTypes.filter((t: string) => t === 'game_cancelled').length).toBe(1);
  });

  it('Check 4: format edit is blocked after a second player joins', async () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const createRes = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportKey: 'badminton',
        formatKey: 'singles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      });
    const gameId = createRes.body.data.id;

    // Second player joins
    await request(app)
      .post(`/api/v1/games/${gameId}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    // Host attempts to change formatKey to 'doubles' -> MUST BE BLOCKED (409)
    const editRes = await request(app)
      .patch(`/api/v1/games/${gameId}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        formatKey: 'doubles',
      });

    expect(editRes.status).toBe(HttpStatus.CONFLICT);
    expect(editRes.body.error.code).toBe(ErrorCodes.CANNOT_EDIT_LOCKED_GAME);
  });
});
