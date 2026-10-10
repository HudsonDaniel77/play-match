import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { VenueService } from '../services/venue.service.js';
import { DiscoveryService } from '../services/discovery.service.js';
import { VenueDiscoveryService } from '../services/venue-discovery.service.js';
import { VenueSuggestionService } from '../services/venue-suggestion.service.js';
import { Venue } from '../models/venue.model.js';
import { sendSuccess, sendCreated } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';
import { logger } from '../utils/logger.js';
import { defaultClock } from '../utils/clock.js';
import { config } from '../config/index.js';

// POST /venues — create venue (venue_owner or admin)
export async function createVenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role as 'venue_owner' | 'admin';
    const venue = await VenueService.createVenue(userId, req.body, userRole, defaultClock);
    sendCreated(res, venue, Messages.VENUES.CREATED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// GET /venues — discover venues
export async function discoverVenues(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as any;
    const filters = {
      lat: Number(query.lat),
      lng: Number(query.lng),
      radiusKm: query.radiusKm !== undefined ? Number(query.radiusKm) : undefined,
      sportKey: query.sportKey,
      amenity: query.amenity,
      openAt: query.openAt ? new Date(query.openAt as string) : undefined,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      cursor: query.cursor,
    };
    const result = await VenueDiscoveryService.discoverVenues(filters, defaultClock);
    sendSuccess(res, result, Messages.VENUES.DISCOVERY_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// GET /venues/mine — my venues (owner or admin)
export async function getMyVenues(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const query = req.query as any;
    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 20), config.DISCOVERY_PAGE_SIZE_MAX ?? 100);
    const skip = (page - 1) * limit;

    const ownerObjectId = new Types.ObjectId(userId);
    const [venues, total] = await Promise.all([
      Venue.find({ owner: ownerObjectId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Venue.countDocuments({ owner: ownerObjectId }),
    ]);

    sendSuccess(res, {
      venues,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }, Messages.VENUES.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// GET /venues/:id — get venue by ID
export async function getVenueById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const viewerId = req.user?.id;
    const userRole = req.user?.role;
    const venue = await VenueService.getVenueById(req.params.id, viewerId, userRole);
    sendSuccess(res, venue, Messages.VENUES.FETCH_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// PATCH /venues/:id — update venue details
export async function updateVenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const venue = await VenueService.updateVenue(req.params.id, userId, userRole, req.body, defaultClock);
    sendSuccess(res, venue, Messages.VENUES.UPDATED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// POST /venues/:id/courts — add court
export async function addCourt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const court = await VenueService.addCourt(req.params.id, userId, userRole, req.body);
    sendCreated(res, court, Messages.VENUES.COURT_ADDED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// PATCH /venues/:id/courts/:courtId — update court
export async function updateCourt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const court = await VenueService.updateCourt(
      req.params.id,
      req.params.courtId,
      userId,
      userRole,
      req.body,
      defaultClock,
    );
    sendSuccess(res, court, Messages.VENUES.COURT_UPDATED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// PUT /venues/:id/hours — set weekly hours
export async function setWeeklyHours(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { hours, adminOverride } = req.body;
    const updatedHours = await VenueService.setWeeklyHours(
      req.params.id,
      userId,
      userRole,
      hours,
      adminOverride,
      defaultClock,
    );
    sendSuccess(res, updatedHours, Messages.VENUES.HOURS_UPDATED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// POST /venues/:id/closures — add closure
export async function addClosure(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const closure = await VenueService.addClosure(
      req.params.id,
      userId,
      userRole,
      req.body,
      defaultClock,
    );
    sendCreated(res, closure, Messages.VENUES.CLOSURE_ADDED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// DELETE /venues/:id/closures/:closureId — remove closure
export async function removeClosure(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    await VenueService.removeClosure(req.params.id, req.params.closureId, userId, userRole);
    sendSuccess(res, null, Messages.VENUES.CLOSURE_REMOVED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// GET /venues/:id/availability — get availability windows
export async function getVenueAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { date } = req.query as { date?: string };
    const dateStr = date || new Date(defaultClock.now()).toISOString().split('T')[0]!;
    const availability = await VenueService.getVenueAvailability(req.params.id, dateStr, defaultClock);
    sendSuccess(res, availability, Messages.VENUES.AVAILABILITY_FETCHED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// POST /venues/:id/approve — admin approves venue (admin only)
export async function approveVenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user!.id;
    const venue = await VenueService.approveVenue(req.params.id, adminId, defaultClock);
    sendSuccess(res, venue, Messages.VENUES.APPROVED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// POST /venues/:id/suspend — admin suspends venue
export async function suspendVenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user!.id;
    const venue = await VenueService.suspendVenue(req.params.id, adminId, defaultClock);
    sendSuccess(res, venue, Messages.VENUES.SUSPENDED_SUCCESS);
  } catch (err) {
    next(err);
  }
}

// POST /venues/:id/reinstate — admin reinstates venue
export async function reinstateVenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user!.id;
    const venue = await VenueService.reinstateVenue(req.params.id, adminId, defaultClock);
    sendSuccess(res, venue, Messages.VENUES.REINSTATED_SUCCESS);
  } catch (err) {
    next(err);
  }
}
