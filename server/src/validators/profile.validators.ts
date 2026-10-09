import { z } from 'zod';
import {
  ProfileVisibility,
  LocationVisibility,
  RatingVisibility,
} from '../constants/visibility.js';

export const updateBasicInfoSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(1, 'Display name is required'),
    bio: z.string().optional(),
    avatarUrl: z.string().url('Avatar must be a valid URL').or(z.literal('')).nullable().optional(),
    dateOfBirth: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
    timezone: z.string().trim().min(1).optional(),
  }),
});

const playerSportSelectionItemSchema = z
  .object({
    sportId: z.string().trim().min(1, 'sportId is required'),
    selectedBandKey: z.string().trim().min(1, 'selectedBandKey is required'),
    playStyle: z.string().trim().nullable().optional(),
    preferredPositions: z.array(z.string().trim()).optional(),
  })
  .strict(); // Rejects any client-supplied rating property!

export const updateSportsSchema = z.object({
  body: z.object({
    sports: z.array(playerSportSelectionItemSchema),
  }),
});

const availabilitySlotInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

export const updateAvailabilitySchema = z.object({
  body: z.object({
    slots: z.array(availabilitySlotInputSchema),
  }),
});

export const updateLocationSchema = z.object({
  body: z.object({
    coordinates: z
      .tuple([
        z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
        z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
      ]),
    locationLabel: z.string().trim().nullable().optional(),
    travelRadiusKm: z.number().min(0.1).optional(),
  }),
});

export const updatePreferencesSchema = z.object({
  body: z.object({
    visibility: z
      .object({
        profile: z
          .enum([
            ProfileVisibility.PUBLIC,
            ProfileVisibility.FRIENDS,
            ProfileVisibility.PRIVATE,
          ])
          .optional(),
        location: z
          .enum([LocationVisibility.COARSENED, LocationVisibility.HIDDEN])
          .optional(),
        ratings: z
          .enum([RatingVisibility.PUBLIC, RatingVisibility.HIDDEN])
          .optional(),
      })
      .optional(),
  }),
});

export const getPublicProfileSchema = z.object({
  params: z.object({
    userId: z.string().trim().min(1, 'User ID is required'),
  }),
});
