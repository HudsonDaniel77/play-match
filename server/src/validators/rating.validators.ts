import { z } from 'zod';
import { MatchSourceTypes } from '../constants/match-sources.js';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const matchSideSchema = z
  .object({
    sideKey: z.string().trim().min(1, 'sideKey is required'),
    playerIds: z
      .array(
        z
          .string()
          .trim()
          .regex(objectIdRegex, 'Each playerId must be a valid 24-character hexadecimal ObjectId'),
      )
      .min(1, 'Each side must contain at least one player'),
    score: z
      .number()
      .int({ message: 'Score must be an integer' })
      .min(0, { message: 'Score must be non-negative' }),
  })
  .strict(); // Disallow any unexpected fields like client ratings

export const applyMatchResultSchema = z.object({
  body: z
    .object({
      sportKey: z.string().trim().min(1, 'sportKey is required'),
      source: z
        .object({
          type: z.enum([MatchSourceTypes.ADMIN_MANUAL, MatchSourceTypes.GAME]),
          id: z.string().trim().min(1, 'source id is required'),
        })
        .strict(),
      sides: z
        .array(matchSideSchema)
        .length(2, 'Match must contain exactly two opposing sides'),
    })
    .strict(), // Non-negotiable Rule 6: No client can inject or set rating
});

export const previewMatchSideSchema = z
  .object({
    sideKey: z.string().trim().min(1, 'sideKey is required'),
    playerIds: z
      .array(
        z
          .string()
          .trim()
          .regex(objectIdRegex, 'Each playerId must be a valid ObjectId'),
      )
      .min(1, 'Each side must contain at least one player'),
  })
  .strict();

export const previewMatchSchema = z.object({
  body: z
    .object({
      sportKey: z.string().trim().min(1, 'sportKey is required'),
      sides: z
        .array(previewMatchSideSchema)
        .length(2, 'Preview must contain exactly two opposing sides'),
    })
    .strict(),
});

export const historyQuerySchema = z.object({
  query: z.object({
    cursor: z.string().trim().optional(),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined))
      .pipe(z.number().int().positive().optional()),
  }),
});

export const leaderboardQuerySchema = z.object({
  query: z.object({
    cursor: z.string().trim().optional(),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined))
      .pipe(z.number().int().positive().optional()),
  }),
});
