import { z } from 'zod';
import {
  GameStatuses,
  JoinPolicies,
  GameVisibilities,
  CancellationReasonCodes,
  ParticipantStatuses,
} from '../constants/game-constants.js';

export const createGameSchema = z.object({
  body: z
    .object({
      sportKey: z.string().min(1, 'sportKey is required').trim().toLowerCase(),
      formatKey: z.string().min(1, 'formatKey is required').trim(),
      startsAt: z
        .string()
        .datetime({ message: 'startsAt must be a valid ISO 8601 date string' })
        .transform((val) => new Date(val)),
      endsAt: z
        .string()
        .datetime({ message: 'endsAt must be a valid ISO 8601 date string' })
        .transform((val) => new Date(val)),
      location: z.object({
        type: z.literal('Point').default('Point'),
        coordinates: z
          .array(z.number())
          .length(2, 'Coordinates must be [longitude, latitude]')
          .refine(
            ([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
            {
              message:
                'Coordinates must be within valid longitude [-180, 180] and latitude [-90, 90]',
            },
          ),
        addressName: z.string().max(200).optional(),
      }).optional(),
      venueId: z.string().trim().optional(),
      courtId: z.string().trim().optional(),
      courtName: z.string().max(100).optional(),
      joinPolicy: z
        .enum([JoinPolicies.OPEN, JoinPolicies.APPROVAL])
        .default(JoinPolicies.OPEN),
      visibility: z
        .enum([GameVisibilities.PUBLIC, GameVisibilities.PRIVATE])
        .default(GameVisibilities.PUBLIC),
      ratingRange: z
        .object({
          min: z.number().min(0),
          max: z.number().min(0),
          allowUnrated: z.boolean().default(true),
        })
        .refine((data) => data.min <= data.max, {
          message: 'ratingRange.min cannot be greater than ratingRange.max',
          path: ['min'],
        })
        .optional(),
      notes: z.string().max(1000).optional(),
    })
    .refine((data) => data.endsAt > data.startsAt, {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    })
    .superRefine((data, ctx) => {
      if (!data.location && !data.venueId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Either location or venueId must be provided',
          path: ['location'],
        });
      }
    }),
});

export const updateGameSchema = z.object({
  body: z
    .object({
      formatKey: z.string().trim().optional(),
      startsAt: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional(),
      endsAt: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional(),
      location: z
        .object({
          type: z.literal('Point').default('Point'),
          coordinates: z
            .array(z.number())
            .length(2)
            .refine(
              ([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
            ),
          addressName: z.string().max(200).optional(),
        })
        .optional(),
      courtName: z.string().max(100).optional(),
      venueId: z.string().trim().optional(),
      courtId: z.string().trim().optional(),
      joinPolicy: z.enum([JoinPolicies.OPEN, JoinPolicies.APPROVAL]).optional(),
      visibility: z
        .enum([GameVisibilities.PUBLIC, GameVisibilities.PRIVATE])
        .optional(),
      ratingRange: z
        .object({
          min: z.number().min(0),
          max: z.number().min(0),
          allowUnrated: z.boolean().default(true),
        })
        .refine((data) => data.min <= data.max, {
          message: 'ratingRange.min cannot be greater than ratingRange.max',
          path: ['min'],
        })
        .optional(),
      notes: z.string().max(1000).optional(),
    })
    .refine(
      (data) => {
        if (data.startsAt && data.endsAt) {
          return data.endsAt > data.startsAt;
        }
        return true;
      },
      {
        message: 'endsAt must be after startsAt',
        path: ['endsAt'],
      },
    ),
});

export const cancelGameSchema = z.object({
  body: z.object({
    reasonCode: z.enum(
      Object.values(CancellationReasonCodes) as [string, ...string[]],
    ),
    reasonText: z.string().max(500).optional(),
  }),
});

export const removeParticipantSchema = z.object({
  body: z
    .object({
      reason: z.string().max(300).optional(),
    })
    .optional(),
});

export const listGamesQuerySchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      sportKey: z.string().trim().toLowerCase().optional(),
      status: z
        .enum(Object.values(GameStatuses) as [string, ...string[]])
        .optional(),
      role: z.enum(['host', 'participant']).optional(),
      participantStatus: z
        .enum(Object.values(ParticipantStatuses) as [string, ...string[]])
        .optional(),
    })
    .optional(),
});
