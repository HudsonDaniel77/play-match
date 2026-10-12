import { Types } from 'mongoose';
import { Venue, type IVenueDocument } from '../models/venue.model.js';
import { config } from '../config/index.js';
import { VenueStatuses } from '../constants/venue-constants.js';
import { AppError } from '../utils/app-error.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { type Clock, defaultClock } from '../utils/clock.js';

export interface DiscoverVenuesFilter {
  lat: number;
  lng: number;
  radiusKm?: number;
  sportKey?: string;
  amenity?: string;
  openAt?: Date;
  limit?: number;
  cursor?: string;
}

export interface DiscoveredVenueItem {
  venue: any;
  distanceKm: number;
}

export interface DiscoverVenuesResult {
  items: DiscoveredVenueItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    totalReturned: number;
  };
}

export class VenueDiscoveryService {
  static encodeCursor(distanceKm: number, id: string): string {
    return Buffer.from(JSON.stringify({ d: distanceKm, id })).toString('base64');
  }

  static decodeCursor(cursorStr: string): { d: number; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(cursorStr, 'base64').toString('utf8'));
      if (parsed.d === undefined || !parsed.id) throw new Error();
      return parsed;
    } catch {
      throw new AppError('Invalid venue discovery cursor', HttpStatus.BAD_REQUEST, ErrorCodes.INVALID_DISCOVERY_CURSOR);
    }
  }

  static async discoverVenues(
    filters: DiscoverVenuesFilter,
    clock: Clock = defaultClock,
  ): Promise<DiscoverVenuesResult> {
    const rawRadius = filters.radiusKm ?? config.DISCOVERY_DEFAULT_RADIUS_KM;
    const clampedRadiusKm = Math.min(
      Math.max(rawRadius, config.DISCOVERY_MIN_RADIUS_KM),
      config.DISCOVERY_MAX_RADIUS_KM,
    );
    const radiusMeters = clampedRadiusKm * 1000;

    const pageSize = Math.min(
      filters.limit ?? config.DISCOVERY_PAGE_SIZE_DEFAULT,
      config.DISCOVERY_PAGE_SIZE_MAX,
    );

    let cursorObj: { d: number; id: string } | null = null;
    if (filters.cursor) {
      cursorObj = this.decodeCursor(filters.cursor);
    }

    const query: any = { status: VenueStatuses.ACTIVE };
    if (filters.sportKey) {
      query['courts.sportKeys'] = filters.sportKey;
      query['courts.isActive'] = true;
    }
    if (filters.amenity) {
      query.amenities = filters.amenity.toLowerCase();
    }

    const pipeline: any[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [filters.lng, filters.lat] },
          distanceField: 'exactDistanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
          query,
        },
      },
    ];

    const candidates = await Venue.aggregate(pipeline);
    const items: DiscoveredVenueItem[] = [];

    for (const v of candidates) {
      // Check openAt filter if provided
      if (filters.openAt) {
        const dt = new Date(filters.openAt);
        const dayOfWeek = dt.getUTCDay();
        const minuteOfDay = dt.getUTCHours() * 60 + dt.getUTCMinutes();

        const isOpenInHours = v.weeklyHours && v.weeklyHours.some(
          (h: any) => h.dayOfWeek === dayOfWeek && minuteOfDay >= h.openMinute && minuteOfDay < h.closeMinute,
        );
        if (!isOpenInHours) continue;

        const isClosed = v.closures && v.closures.some(
          (c: any) => dt >= new Date(c.startsAt) && dt <= new Date(c.endsAt),
        );
        if (isClosed) continue;
      }

      const distanceKm = Math.round((v.exactDistanceMeters / 1000) * 100) / 100;
      v.id = v._id.toString();
      items.push({
        venue: v,
        distanceKm,
      });
    }

    // Keyset sorting by distance, then id
    items.sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.venue.id.localeCompare(b.venue.id);
    });

    let startIndex = 0;
    if (cursorObj) {
      const idx = items.findIndex(
        (it) => it.distanceKm > cursorObj!.d || (it.distanceKm === cursorObj!.d && it.venue.id > cursorObj!.id),
      );
      startIndex = idx !== -1 ? idx : items.length;
    }

    const pageItems = items.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < items.length;

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const last = pageItems[pageItems.length - 1]!;
      nextCursor = this.encodeCursor(last.distanceKm, last.venue.id);
    }

    return {
      items: pageItems,
      pagination: {
        hasMore,
        nextCursor,
        totalReturned: pageItems.length,
      },
    };
  }
}
