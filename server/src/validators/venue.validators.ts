import { z } from 'zod';
import { DiscoverySortOptions } from '../constants/venue-constants.js';

const coordinatesSchema = z
  .array(z.number())
  .length(2)
  .refine(([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, {
    message: 'Coordinates must be valid [longitude, latitude]',
  });

const weeklyHourSlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    openMinute: z.number().int().min(0).max(1439),
    closeMinute: z.number().int().min(1).max(1440),
  })
  .refine((data) => data.openMinute < data.closeMinute, {
    message: 'openMinute must be strictly less than closeMinute',
  });

export const createVenueSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(5).max(1000),
    address: z.object({
      line1: z.string().trim().min(1),
      line2: z.string().trim().optional(),
      city: z.string().trim().min(1),
      state: z.string().trim().optional(),
      postalCode: z.string().trim().optional(),
    }),
    areaLabel: z.string().trim().min(1),
    location: z.object({
      type: z.literal('Point').default('Point'),
      coordinates: coordinatesSchema,
    }),
    timezone: z.string().trim().min(1),
    contactInfo: z
      .object({
        phone: z.string().trim().optional(),
        email: z.string().email().optional(),
        website: z.string().url().optional(),
      })
      .optional(),
    photoUrls: z.array(z.string().url()).max(10).optional(),
    amenities: z
      .array(z.string().trim().toLowerCase().regex(/^[a-z0-9_-]+$/))
      .max(20)
      .optional(),
    weeklyHours: z.array(weeklyHourSlotSchema).optional(),
    courts: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          sportKeys: z.array(z.string().trim().min(1)).min(1),
          isActive: z.boolean().optional(),
        }),
      )
      .optional(),
  }),
});

export const updateVenueSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().min(5).max(1000).optional(),
    address: z
      .object({
        line1: z.string().trim().min(1),
        line2: z.string().trim().optional(),
        city: z.string().trim().min(1),
        state: z.string().trim().optional(),
        postalCode: z.string().trim().optional(),
      })
      .optional(),
    areaLabel: z.string().trim().min(1).optional(),
    location: z
      .object({
        type: z.literal('Point').default('Point'),
        coordinates: coordinatesSchema,
      })
      .optional(),
    timezone: z.string().trim().min(1).optional(),
    contactInfo: z
      .object({
        phone: z.string().trim().optional(),
        email: z.string().email().optional(),
        website: z.string().url().optional(),
      })
      .optional(),
    photoUrls: z.array(z.string().url()).max(10).optional(),
    amenities: z
      .array(z.string().trim().toLowerCase().regex(/^[a-z0-9_-]+$/))
      .max(20)
      .optional(),
    adminOverride: z.boolean().optional(),
    overrideReason: z.string().trim().optional(),
  }),
});

export const addCourtSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1),
    sportKeys: z.array(z.string().trim().min(1)).min(1),
    isActive: z.boolean().optional(),
  }),
});

export const updateCourtSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).optional(),
    sportKeys: z.array(z.string().trim().min(1)).min(1).optional(),
    isActive: z.boolean().optional(),
    adminOverride: z.boolean().optional(),
  }),
});

export const setWeeklyHoursSchema = z.object({
  body: z.object({
    hours: z.array(weeklyHourSlotSchema),
    adminOverride: z.boolean().optional(),
  }),
});

export const addClosureSchema = z.object({
  body: z
    .object({
      startsAt: z.string().datetime().transform((v) => new Date(v)),
      endsAt: z.string().datetime().transform((v) => new Date(v)),
      reason: z.string().trim().max(500).optional(),
      adminOverride: z.boolean().optional(),
    })
    .refine((data) => data.endsAt > data.startsAt, {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    }),
});

export const discoverVenuesQuerySchema = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce.number().positive().optional(),
    sportKey: z.string().trim().optional(),
    amenity: z.string().trim().optional(),
    openAt: z
      .string()
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
    limit: z.coerce.number().int().positive().optional(),
    cursor: z.string().trim().optional(),
  }),
});

export const discoverGamesQuerySchema = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().optional(),
    sportKey: z.string().trim().optional(),
    formatKey: z.string().trim().optional(),
    startsAfter: z
      .string()
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
    startsBefore: z
      .string()
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
    joinPolicy: z.string().trim().optional(),
    venueId: z.string().trim().optional(),
    openSeatsOnly: z.coerce.boolean().optional(),
    hideMine: z.coerce.boolean().optional(),
    ratingEligibleOnly: z.coerce.boolean().optional(),
    sortBy: z
      .enum([DiscoverySortOptions.DISTANCE, DiscoverySortOptions.START_TIME])
      .optional(),
    limit: z.coerce.number().int().positive().optional(),
    cursor: z.string().trim().optional(),
    explain: z.coerce.boolean().optional(),
  }),
});
