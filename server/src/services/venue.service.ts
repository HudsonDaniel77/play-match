import mongoose, { Types } from 'mongoose';
import { Venue, type IVenueDocument, type IWeeklyHourSlot, type IVenueClosure, type ICourt } from '../models/venue.model.js';
import { CourtGuard } from '../models/court-guard.model.js';
import { Game } from '../models/game.model.js';
import { Sport } from '../models/sport.model.js';
import { config } from '../config/index.js';
import {
  VenueStatuses,
  VenueEventTypes,
  type VenueStatus,
} from '../constants/venue-constants.js';
import { GameStatuses } from '../constants/game-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { Messages } from '../constants/messages.js';
import { type Clock, defaultClock } from '../utils/clock.js';
import { TransactionEventBuffer } from '../utils/domain-events.js';
import { generateRandomAlphaNumeric } from '../utils/crypto.js';

export interface CreateVenueInput {
  name: string;
  description: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
  };
  areaLabel: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  timezone: string;
  contactInfo?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  photoUrls?: string[];
  amenities?: string[];
  weeklyHours?: IWeeklyHourSlot[];
  courts?: Array<{
    name: string;
    sportKeys: string[];
    isActive?: boolean;
  }>;
}

export interface UpdateVenueInput {
  name?: string;
  description?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
  };
  areaLabel?: string;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
  timezone?: string;
  contactInfo?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  photoUrls?: string[];
  amenities?: string[];
  adminOverride?: boolean;
  overrideReason?: string;
}

export interface FreeWindow {
  startsAt: string; // ISO string
  endsAt: string;   // ISO string
}

export interface CourtAvailability {
  courtId: string;
  courtName: string;
  sportKeys: string[];
  freeWindows: FreeWindow[];
}

export class VenueService {
  /**
   * Helper to validate operating hours:
   * - 0 <= dayOfWeek <= 6
   * - 0 <= openMinute < closeMinute <= 1440
   * - No overlapping windows on the same dayOfWeek
   */
  static validateWeeklyHours(hours: IWeeklyHourSlot[]): void {
    const byDay = new Map<number, IWeeklyHourSlot[]>();
    for (const h of hours) {
      if (h.openMinute >= h.closeMinute) {
        throw new AppError(
          'Operating hours openMinute must be strictly less than closeMinute',
          HttpStatus.BAD_REQUEST,
          ErrorCodes.INVALID_OPERATING_HOURS,
        );
      }
      const daySlots = byDay.get(h.dayOfWeek) || [];
      daySlots.push(h);
      byDay.set(h.dayOfWeek, daySlots);
    }

    for (const [day, slots] of byDay.entries()) {
      slots.sort((a, b) => a.openMinute - b.openMinute);
      for (let i = 0; i < slots.length - 1; i++) {
        const cur = slots[i]!;
        const nxt = slots[i + 1]!;
        if (cur.closeMinute > nxt.openMinute) {
          throw new AppError(
            `Operating hours overlap detected on dayOfWeek ${day}`,
            HttpStatus.BAD_REQUEST,
            ErrorCodes.INVALID_OPERATING_HOURS,
          );
        }
      }
    }
  }

  /**
   * Helper to find upcoming non-terminal games that would conflict with a venue change
   */
  static async findUpcomingActiveGames(venueId: Types.ObjectId | string, clock: Clock): Promise<any[]> {
    return Game.find({
      venue: typeof venueId === 'string' ? new Types.ObjectId(venueId) : venueId,
      status: {
        $in: [
          GameStatuses.OPEN,
          GameStatuses.FULL,
          GameStatuses.CONFIRMED,
          GameStatuses.IN_PROGRESS,
        ],
      },
      endsAt: { $gt: clock.now() },
    });
  }

  static async createVenue(
    ownerId: Types.ObjectId | string,
    input: CreateVenueInput,
    userRole: 'venue_owner' | 'admin',
    clock: Clock = defaultClock,
  ): Promise<IVenueDocument> {
    const ownerObjectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    // Check max venues per owner
    const existingCount = await Venue.countDocuments({
      owner: ownerObjectId,
      status: { $ne: VenueStatuses.ARCHIVED },
    });
    if (existingCount >= config.MAX_VENUES_PER_OWNER) {
      throw new AppError(
        'Maximum allowed venues per owner reached',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.MAX_VENUES_EXCEEDED,
      );
    }

    if (input.weeklyHours) {
      this.validateWeeklyHours(input.weeklyHours);
    }

    // Validate court sport keys against active catalog
    const courtsToCreate: ICourt[] = [];
    if (input.courts && input.courts.length > 0) {
      if (input.courts.length > config.MAX_COURTS_PER_VENUE) {
        throw new AppError(
          'Maximum allowed courts per venue exceeded',
          HttpStatus.BAD_REQUEST,
          ErrorCodes.MAX_COURTS_EXCEEDED,
        );
      }
      for (const c of input.courts) {
        for (const sk of c.sportKeys) {
          const sp = await Sport.findOne({ key: sk, isActive: true });
          if (!sp) {
            throw new AppError(
              `Sport ${sk} not found in catalog`,
              HttpStatus.BAD_REQUEST,
              ErrorCodes.SPORT_NOT_FOUND,
            );
          }
        }
        courtsToCreate.push({
          courtId: generateRandomAlphaNumeric(8).toLowerCase(),
          name: c.name,
          sportKeys: c.sportKeys,
          isActive: c.isActive !== undefined ? c.isActive : true,
        });
      }
    }

    const initialStatus =
      config.VENUE_REQUIRE_ADMIN_APPROVAL && userRole !== 'admin'
        ? VenueStatuses.PENDING_APPROVAL
        : VenueStatuses.ACTIVE;

    const session = await mongoose.startSession();
    const eventBuffer = new TransactionEventBuffer();
    let createdVenue: IVenueDocument;

    try {
      await session.withTransaction(async () => {
        const [venue] = await Venue.create(
          [
            {
              owner: ownerObjectId,
              name: input.name,
              description: input.description,
              address: input.address,
              areaLabel: input.areaLabel,
              location: input.location,
              timezone: input.timezone,
              contactInfo: input.contactInfo,
              photoUrls: input.photoUrls || [],
              amenities: input.amenities || [],
              weeklyHours: input.weeklyHours || [],
              closures: [],
              courts: courtsToCreate,
              status: initialStatus,
              approvedBy: initialStatus === VenueStatuses.ACTIVE ? ownerObjectId : undefined,
              approvedAt: initialStatus === VenueStatuses.ACTIVE ? clock.now() : undefined,
            },
          ],
          { session },
        );

        createdVenue = venue;

        // Pre-create CourtGuard for each court inside the transaction (Phase 0 requirement 3)
        for (const court of courtsToCreate) {
          await CourtGuard.create(
            [
              {
                venueId: venue._id,
                courtId: court.courtId,
                version: 1,
              },
            ],
            { session },
          );
        }

        eventBuffer.buffer({
          type: VenueEventTypes.VENUE_CREATED,
          gameId: venue._id.toString(), // context identifier
          actorId: ownerObjectId.toString(),
          timestamp: clock.now(),
          data: { venueId: venue._id.toString(), status: initialStatus },
        });

        if (initialStatus === VenueStatuses.ACTIVE) {
          eventBuffer.buffer({
            type: VenueEventTypes.VENUE_APPROVED,
            gameId: venue._id.toString(),
            actorId: ownerObjectId.toString(),
            timestamp: clock.now(),
            data: { venueId: venue._id.toString() },
          });
        }
      });
    } finally {
      await session.endSession();
    }

    eventBuffer.commit();
    return createdVenue!;
  }

  static async getVenueById(
    venueId: Types.ObjectId | string,
    viewerId?: Types.ObjectId | string,
    userRole?: string,
  ): Promise<IVenueDocument> {
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    const vIdStr = viewerId ? viewerId.toString() : null;
    const isOwner = vIdStr && venue.owner.toString() === vIdStr;
    const isAdmin = userRole === 'admin';

    // Public reads show only active venues; owners/admins see their own in any state
    if (venue.status !== VenueStatuses.ACTIVE && !isOwner && !isAdmin) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    return venue;
  }

  static async updateVenue(
    venueId: Types.ObjectId | string,
    actorId: Types.ObjectId | string,
    actorRole: string,
    input: UpdateVenueInput,
    clock: Clock = defaultClock,
  ): Promise<IVenueDocument> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    const isOwner = venue.owner.toString() === actorObjectId.toString();
    const isAdmin = actorRole === 'admin';

    if (!isOwner && !isAdmin) {
      throw new AppError(
        Messages.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    // Changing location or timezone check
    if (input.location || (input.timezone && input.timezone !== venue.timezone)) {
      const affectedGames = await this.findUpcomingActiveGames(venue._id, clock);
      if (affectedGames.length > 0 && !(isAdmin && input.adminOverride)) {
        throw new AppError(
          'Changing venue location or timezone is blocked while upcoming active games exist',
          HttpStatus.CONFLICT,
          ErrorCodes.VENUE_MOVE_BLOCKED,
          { affectedGames: affectedGames.map((g) => ({ id: g._id, startsAt: g.startsAt })) },
        );
      }
    }

    if (input.name !== undefined) venue.name = input.name;
    if (input.description !== undefined) venue.description = input.description;
    if (input.address !== undefined) venue.address = input.address;
    if (input.areaLabel !== undefined) venue.areaLabel = input.areaLabel;
    if (input.location !== undefined) venue.location = input.location;
    if (input.timezone !== undefined) venue.timezone = input.timezone;
    if (input.contactInfo !== undefined) venue.contactInfo = input.contactInfo;
    if (input.photoUrls !== undefined) venue.photoUrls = input.photoUrls;
    if (input.amenities !== undefined) venue.amenities = input.amenities;

    await venue.save();
    return venue;
  }

  static async addCourt(
    venueId: Types.ObjectId | string,
    actorId: Types.ObjectId | string,
    actorRole: string,
    courtInput: { name: string; sportKeys: string[]; isActive?: boolean },
  ): Promise<ICourt> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    const isOwner = venue.owner.toString() === actorObjectId.toString();
    const isAdmin = actorRole === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError(
        Messages.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    if (venue.courts.length >= config.MAX_COURTS_PER_VENUE) {
      throw new AppError(
        'Maximum allowed courts per venue exceeded',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.MAX_COURTS_EXCEEDED,
      );
    }

    for (const sk of courtInput.sportKeys) {
      const sp = await Sport.findOne({ key: sk, isActive: true });
      if (!sp) {
        throw new AppError(
          `Sport ${sk} not found in catalog`,
          HttpStatus.BAD_REQUEST,
          ErrorCodes.SPORT_NOT_FOUND,
        );
      }
    }

    const newCourt: ICourt = {
      courtId: generateRandomAlphaNumeric(8).toLowerCase(),
      name: courtInput.name,
      sportKeys: courtInput.sportKeys,
      isActive: courtInput.isActive !== undefined ? courtInput.isActive : true,
    };

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        venue.courts.push(newCourt);
        await venue.save({ session });

        // Pre-create CourtGuard for race safety
        await CourtGuard.create(
          [
            {
              venueId: venue._id,
              courtId: newCourt.courtId,
              version: 1,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return newCourt;
  }

  static async updateCourt(
    venueId: Types.ObjectId | string,
    courtId: string,
    actorId: Types.ObjectId | string,
    actorRole: string,
    update: { name?: string; sportKeys?: string[]; isActive?: boolean; adminOverride?: boolean },
    clock: Clock = defaultClock,
  ): Promise<ICourt> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    const isOwner = venue.owner.toString() === actorObjectId.toString();
    const isAdmin = actorRole === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError(
        Messages.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
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

    // Check deactivation impact
    if (update.isActive === false && court.isActive === true) {
      const affectedGames = await Game.find({
        venue: venue._id,
        courtId,
        status: {
          $in: [
            GameStatuses.OPEN,
            GameStatuses.FULL,
            GameStatuses.CONFIRMED,
            GameStatuses.IN_PROGRESS,
          ],
        },
        endsAt: { $gt: clock.now() },
      });

      if (affectedGames.length > 0 && !(isAdmin && update.adminOverride)) {
        throw new AppError(
          'Court deactivation is blocked while upcoming active games exist',
          HttpStatus.CONFLICT,
          ErrorCodes.COURT_DEACTIVATION_BLOCKED,
          { affectedGames: affectedGames.map((g) => ({ id: g._id, startsAt: g.startsAt })) },
        );
      }
    }

    if (update.name !== undefined) court.name = update.name;
    if (update.sportKeys !== undefined) {
      for (const sk of update.sportKeys) {
        const sp = await Sport.findOne({ key: sk, isActive: true });
        if (!sp) {
          throw new AppError(
            `Sport ${sk} not found in catalog`,
            HttpStatus.BAD_REQUEST,
            ErrorCodes.SPORT_NOT_FOUND,
          );
        }
      }
      court.sportKeys = update.sportKeys;
    }
    if (update.isActive !== undefined) court.isActive = update.isActive;

    await venue.save();
    return court;
  }

  static async setWeeklyHours(
    venueId: Types.ObjectId | string,
    actorId: Types.ObjectId | string,
    actorRole: string,
    hours: IWeeklyHourSlot[],
    adminOverride = false,
    clock: Clock = defaultClock,
  ): Promise<IWeeklyHourSlot[]> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    const isOwner = venue.owner.toString() === actorObjectId.toString();
    const isAdmin = actorRole === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError(
        Messages.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    this.validateWeeklyHours(hours);

    // Check impact on upcoming games
    const affectedGames = await this.findUpcomingActiveGames(venue._id, clock);
    if (affectedGames.length > 0 && !(isAdmin && adminOverride)) {
      throw new AppError(
        'Modifying operating hours is blocked while upcoming active games exist',
        HttpStatus.CONFLICT,
        ErrorCodes.VENUE_HOURS_CHANGE_BLOCKED,
        { affectedGames: affectedGames.map((g) => ({ id: g._id, startsAt: g.startsAt })) },
      );
    }

    venue.weeklyHours = hours;
    await venue.save();
    return venue.weeklyHours;
  }

  static async addClosure(
    venueId: Types.ObjectId | string,
    actorId: Types.ObjectId | string,
    actorRole: string,
    closureInput: { startsAt: Date; endsAt: Date; reason?: string; adminOverride?: boolean },
    clock: Clock = defaultClock,
  ): Promise<IVenueClosure> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    const isOwner = venue.owner.toString() === actorObjectId.toString();
    const isAdmin = actorRole === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError(
        Messages.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    if (closureInput.endsAt <= closureInput.startsAt) {
      throw new AppError(
        'Closure endsAt must be after startsAt',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // Check impact on upcoming games overlapping closure
    const affectedGames = await Game.find({
      venue: venue._id,
      status: {
        $in: [
          GameStatuses.OPEN,
          GameStatuses.FULL,
          GameStatuses.CONFIRMED,
          GameStatuses.IN_PROGRESS,
        ],
      },
      startsAt: { $lt: closureInput.endsAt },
      endsAt: { $gt: closureInput.startsAt },
    });

    if (affectedGames.length > 0 && !(isAdmin && closureInput.adminOverride)) {
      throw new AppError(
        'Scheduling closure is blocked because it overlaps upcoming active games',
        HttpStatus.CONFLICT,
        ErrorCodes.VENUE_CLOSURE_BLOCKED,
        { affectedGames: affectedGames.map((g) => ({ id: g._id, startsAt: g.startsAt })) },
      );
    }

    const newClosure: IVenueClosure = {
      closureId: generateRandomAlphaNumeric(8).toLowerCase(),
      startsAt: closureInput.startsAt,
      endsAt: closureInput.endsAt,
      reason: closureInput.reason,
    };

    venue.closures.push(newClosure);
    await venue.save();
    return newClosure;
  }

  static async removeClosure(
    venueId: Types.ObjectId | string,
    closureId: string,
    actorId: Types.ObjectId | string,
    actorRole: string,
  ): Promise<void> {
    const actorObjectId = typeof actorId === 'string' ? new Types.ObjectId(actorId) : actorId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    const isOwner = venue.owner.toString() === actorObjectId.toString();
    const isAdmin = actorRole === 'admin';
    if (!isOwner && !isAdmin) {
      throw new AppError(
        Messages.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    venue.closures = venue.closures.filter((c) => c.closureId !== closureId);
    await venue.save();
  }

  static async approveVenue(
    venueId: Types.ObjectId | string,
    adminId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<IVenueDocument> {
    const adminObjectId = typeof adminId === 'string' ? new Types.ObjectId(adminId) : adminId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    venue.status = VenueStatuses.ACTIVE;
    venue.approvedBy = adminObjectId;
    venue.approvedAt = clock.now();
    await venue.save();

    const eventBuffer = new TransactionEventBuffer();
    eventBuffer.buffer({
      type: VenueEventTypes.VENUE_APPROVED,
      gameId: venue._id.toString(),
      actorId: adminObjectId.toString(),
      timestamp: clock.now(),
      data: { venueId: venue._id.toString() },
    });
    eventBuffer.commit();

    return venue;
  }

  static async suspendVenue(
    venueId: Types.ObjectId | string,
    adminId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<IVenueDocument> {
    const adminObjectId = typeof adminId === 'string' ? new Types.ObjectId(adminId) : adminId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    venue.status = VenueStatuses.SUSPENDED;
    await venue.save();

    // Query affected games to include in domain event
    const affectedGames = await this.findUpcomingActiveGames(venue._id, clock);

    const eventBuffer = new TransactionEventBuffer();
    eventBuffer.buffer({
      type: VenueEventTypes.VENUE_SUSPENDED,
      gameId: venue._id.toString(),
      actorId: adminObjectId.toString(),
      timestamp: clock.now(),
      data: {
        venueId: venue._id.toString(),
        affectedGameIds: affectedGames.map((g) => g._id.toString()),
      },
    });
    eventBuffer.commit();

    return venue;
  }

  static async reinstateVenue(
    venueId: Types.ObjectId | string,
    adminId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<IVenueDocument> {
    const adminObjectId = typeof adminId === 'string' ? new Types.ObjectId(adminId) : adminId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    venue.status = VenueStatuses.ACTIVE;
    await venue.save();

    const eventBuffer = new TransactionEventBuffer();
    eventBuffer.buffer({
      type: VenueEventTypes.VENUE_REINSTATED,
      gameId: venue._id.toString(),
      actorId: adminObjectId.toString(),
      timestamp: clock.now(),
      data: { venueId: venue._id.toString() },
    });
    eventBuffer.commit();

    return venue;
  }

  static async archiveVenue(
    venueId: Types.ObjectId | string,
    ownerId: Types.ObjectId | string,
    clock: Clock = defaultClock,
  ): Promise<IVenueDocument> {
    const ownerObjectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;
    const venue = await Venue.findById(venueId);
    if (!venue) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    if (venue.owner.toString() !== ownerObjectId.toString()) {
      throw new AppError(
        Messages.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }

    venue.status = VenueStatuses.ARCHIVED;
    await venue.save();

    const affectedGames = await this.findUpcomingActiveGames(venue._id, clock);

    const eventBuffer = new TransactionEventBuffer();
    eventBuffer.buffer({
      type: VenueEventTypes.VENUE_SUSPENDED,
      gameId: venue._id.toString(),
      actorId: ownerObjectId.toString(),
      timestamp: clock.now(),
      data: {
        venueId: venue._id.toString(),
        reason: 'archived_by_owner',
        affectedGameIds: affectedGames.map((g) => g._id.toString()),
      },
    });
    eventBuffer.commit();

    return venue;
  }

  /**
   * Pure availability computation for a date:
   * Returns free time windows per court across hours, closures, and booked games (+buffer).
   */
  static async getVenueAvailability(
    venueId: Types.ObjectId | string,
    dateStr: string, // YYYY-MM-DD
    clock: Clock = defaultClock,
  ): Promise<CourtAvailability[]> {
    const venue = await Venue.findById(venueId);
    if (!venue || venue.status !== VenueStatuses.ACTIVE) {
      throw new AppError(
        Messages.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        ErrorCodes.VENUE_NOT_FOUND,
      );
    }

    // Determine day of week in venue's timezone for given date
    // Create UTC midnight anchor for the requested date YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) {
      throw new AppError('Invalid date format YYYY-MM-DD', HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR);
    }

    // Compute UTC window for the day in venue timezone
    // e.g. from 00:00 to 24:00 in venue.timezone
    const targetDayIndex = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();

    const daySlots = venue.weeklyHours.filter((h) => h.dayOfWeek === targetDayIndex);
    const courts = venue.courts.filter((c) => c.isActive);

    const dayStartUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const dayEndUtc = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

    // Fetch all active games on this venue during the day (+ buffer)
    const bufferMs = config.COURT_BUFFER_MINUTES * 60 * 1000;
    const bookedGames = await Game.find({
      venue: venue._id,
      status: {
        $in: [
          GameStatuses.OPEN,
          GameStatuses.FULL,
          GameStatuses.CONFIRMED,
          GameStatuses.IN_PROGRESS,
        ],
      },
      startsAt: { $lt: new Date(dayEndUtc.getTime() + bufferMs) },
      endsAt: { $gt: new Date(dayStartUtc.getTime() - bufferMs) },
    });

    const activeClosures = venue.closures.filter(
      (c) => c.startsAt < dayEndUtc && c.endsAt > dayStartUtc,
    );

    const result: CourtAvailability[] = [];

    for (const court of courts) {
      const freeWindows: FreeWindow[] = [];

      for (const slot of daySlots) {
        // Slot start & end in UTC
        const slotStart = new Date(dayStartUtc.getTime() + slot.openMinute * 60 * 1000);
        const slotEnd = new Date(dayStartUtc.getTime() + slot.closeMinute * 60 * 1000);

        // Blocked intervals for this court
        const busyIntervals: Array<{ start: number; end: number }> = [];

        // Add closures
        for (const cl of activeClosures) {
          busyIntervals.push({
            start: Math.max(slotStart.getTime(), cl.startsAt.getTime()),
            end: Math.min(slotEnd.getTime(), cl.endsAt.getTime()),
          });
        }

        // Add booked games with buffer
        const courtGames = bookedGames.filter((g) => g.courtId === court.courtId);
        for (const g of courtGames) {
          busyIntervals.push({
            start: Math.max(slotStart.getTime(), g.startsAt.getTime() - bufferMs),
            end: Math.min(slotEnd.getTime(), g.endsAt.getTime() + bufferMs),
          });
        }

        // Merge busy intervals
        busyIntervals.sort((a, b) => a.start - b.end);
        const mergedBusy: Array<{ start: number; end: number }> = [];
        for (const int of busyIntervals) {
          if (int.start >= int.end) continue;
          if (mergedBusy.length === 0) {
            mergedBusy.push(int);
          } else {
            const last = mergedBusy[mergedBusy.length - 1]!;
            if (int.start <= last.end) {
              last.end = Math.max(last.end, int.end);
            } else {
              mergedBusy.push(int);
            }
          }
        }

        // Invert to find free intervals
        let cursor = slotStart.getTime();
        for (const busy of mergedBusy) {
          if (busy.start > cursor) {
            freeWindows.push({
              startsAt: new Date(cursor).toISOString(),
              endsAt: new Date(busy.start).toISOString(),
            });
          }
          cursor = Math.max(cursor, busy.end);
        }
        if (cursor < slotEnd.getTime()) {
          freeWindows.push({
            startsAt: new Date(cursor).toISOString(),
            endsAt: new Date(slotEnd.getTime()).toISOString(),
          });
        }
      }

      result.push({
        courtId: court.courtId,
        courtName: court.name,
        sportKeys: court.sportKeys,
        freeWindows,
      });
    }

    return result;
  }
}
