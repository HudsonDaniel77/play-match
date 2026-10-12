import mongoose, { type ClientSession, type Types } from 'mongoose';
import { Venue } from '../models/venue.model.js';
import { CourtGuard } from '../models/court-guard.model.js';
import { Game } from '../models/game.model.js';
import { Sport } from '../models/sport.model.js';
import { config } from '../config/index.js';
import { VenueStatuses } from '../constants/venue-constants.js';
import { GameStatuses } from '../constants/game-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { type Clock, defaultClock } from '../utils/clock.js';

export interface VerifyAndLockReservationParams {
  venueId: Types.ObjectId;
  courtId: string;
  sportKey: string;
  startsAt: Date;
  endsAt: Date;
  excludeGameId?: Types.ObjectId;
  session: ClientSession;
  clock?: Clock;
}

export class CourtReservationService {
  /**
   * Validates venue status, court existence, court sport compatibility,
   * operating hours, closure intervals, acquires CourtGuard lock, and
   * ensures no overlapping reservation exists within the court buffer.
   */
  static async verifyAndLockReservation(
    params: VerifyAndLockReservationParams,
  ): Promise<{ venue: any; court: any }> {
    const {
      venueId,
      courtId,
      sportKey,
      startsAt,
      endsAt,
      excludeGameId,
      session,
      clock = defaultClock,
    } = params;

    const venue = await Venue.findById(venueId).session(session);
    if (!venue) {
      throw new AppError(
        'Venue not found',
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    if (venue.status !== VenueStatuses.ACTIVE) {
      throw new AppError(
        'Cannot book games at inactive or suspended venues',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VENUE_NOT_ACTIVE,
      );
    }

    const court = venue.courts.find((c) => c.courtId === courtId);
    if (!court) {
      throw new AppError(
        'Court not found in venue',
        HttpStatus.NOT_FOUND,
        ErrorCodes.COURT_NOT_FOUND,
      );
    }

    if (!court.isActive) {
      throw new AppError(
        'Selected court is currently inactive',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.COURT_INACTIVE,
      );
    }

    if (!court.sportKeys.includes(sportKey)) {
      throw new AppError(
        `Court does not support sport ${sportKey}`,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.COURT_SPORT_UNSUPPORTED,
      );
    }

    // Check operating hours in venue's timezone
    // Get start & end minute from midnight UTC
    const gameDay = startsAt.getUTCDay();
    const gameStartMinute = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
    const gameEndMinute = endsAt.getUTCHours() * 60 + endsAt.getUTCMinutes();

    const fitsInHours = venue.weeklyHours.some(
      (h) =>
        h.dayOfWeek === gameDay &&
        gameStartMinute >= h.openMinute &&
        gameEndMinute <= h.closeMinute,
    );

    if (venue.weeklyHours.length > 0 && !fitsInHours) {
      throw new AppError(
        'Game time range falls outside venue operating hours',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.OUTSIDE_VENUE_HOURS,
      );
    }

    // Check closures
    const inClosure = venue.closures.some(
      (c) => startsAt < c.endsAt && endsAt > c.startsAt,
    );
    if (inClosure) {
      throw new AppError(
        'Venue is closed during the selected time period',
        HttpStatus.CONFLICT,
        ErrorCodes.VENUE_CLOSED,
      );
    }

    // Acquire CourtGuard lock (increment version)
    // Requirement 3: acquire CourtGuard without upsert
    const guard = await CourtGuard.findOneAndUpdate(
      { venueId, courtId },
      { $inc: { version: 1 } },
      { session, new: true },
    );

    if (!guard) {
      // Guard was not pre-created or does not exist
      throw new AppError(
        'Court guard synchronization record missing',
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCodes.INTERNAL_SERVER_ERROR,
      );
    }

    // Overlap query with buffer
    const bufferMs = config.COURT_BUFFER_MINUTES * 60 * 1000;
    const bufferedStart = new Date(startsAt.getTime() - bufferMs);
    const bufferedEnd = new Date(endsAt.getTime() + bufferMs);

    const conflictQuery: any = {
      venue: venueId,
      courtId,
      status: {
        $in: [
          GameStatuses.OPEN,
          GameStatuses.FULL,
          GameStatuses.CONFIRMED,
          GameStatuses.IN_PROGRESS,
        ],
      },
      startsAt: { $lt: bufferedEnd },
      endsAt: { $gt: bufferedStart },
    };

    if (excludeGameId) {
      conflictQuery._id = { $ne: excludeGameId };
    }

    const conflictGame = await Game.findOne(conflictQuery).session(session);
    if (conflictGame) {
      throw new AppError(
        'Court is already reserved for an overlapping game during this time slot',
        HttpStatus.CONFLICT,
        ErrorCodes.COURT_RESERVATION_CONFLICT,
      );
    }

    return { venue, court };
  }

  /**
   * Acquire guards in deterministic sorted order when moving between courts
   */
  static async lockMultipleGuards(
    guards: Array<{ venueId: Types.ObjectId; courtId: string }>,
    session: ClientSession,
  ): Promise<void> {
    // Sort keys alphabetically by "${venueId}:${courtId}"
    const sorted = [...guards].sort((a, b) =>
      `${a.venueId.toString()}:${a.courtId}`.localeCompare(`${b.venueId.toString()}:${b.courtId}`),
    );

    for (const g of sorted) {
      const locked = await CourtGuard.findOneAndUpdate(
        { venueId: g.venueId, courtId: g.courtId },
        { $inc: { version: 1 } },
        { session },
      );
      if (!locked) {
        throw new AppError('Court guard missing', HttpStatus.INTERNAL_SERVER_ERROR, ErrorCodes.INTERNAL_SERVER_ERROR);
      }
    }
  }
}
