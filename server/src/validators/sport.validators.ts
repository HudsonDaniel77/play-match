import { z } from 'zod';
import { ScoringTypes } from '../constants/scoring-types.js';

const skillBandInputSchema = z.object({
  key: z.string().trim().min(1, 'Skill band key is required'),
  label: z.string().trim().min(1, 'Skill band label is required'),
  order: z.number().int().min(1, 'Order must be a positive integer'),
  seedRating: z.number().int().min(100, 'Seed rating must be at least 100'),
});

const playStyleInputSchema = z.object({
  key: z.string().trim().min(1, 'Play style key is required'),
  label: z.string().trim().min(1, 'Play style label is required'),
});

const positionInputSchema = z.object({
  key: z.string().trim().min(1, 'Position key is required'),
  label: z.string().trim().min(1, 'Position label is required'),
});

const formatInputSchema = z.object({
  key: z.string().trim().min(1, 'Format key is required'),
  label: z.string().trim().min(1, 'Format label is required'),
  playersPerSide: z
    .number()
    .int('playersPerSide must be an integer')
    .min(1, 'playersPerSide must be at least 1'),
  isDefault: z.boolean().default(false),
});

const scoringInputSchema = z.object({
  type: z.enum([ScoringTypes.SETS, ScoringTypes.RUNS, ScoringTypes.GOALS]),
  allowsDraws: z.boolean().default(false),
});

export const createSportSchema = z.object({
  body: z
    .object({
      key: z
        .string()
        .trim()
        .min(2, 'Sport key must be at least 2 characters')
        .regex(/^[a-z0-9_-]+$/, 'Sport key must contain only lowercase alphanumeric characters, dashes, or underscores'),
      name: z.string().trim().min(2, 'Sport name must be at least 2 characters'),
      isActive: z.boolean().optional(),
      isTeamBased: z.boolean().optional(),
      allowsDraws: z.boolean().optional(),
      minPlayers: z.number().int().min(1, 'minPlayers must be at least 1'),
      maxPlayers: z.number().int().min(1, 'maxPlayers must be at least 1'),
      formats: z.array(formatInputSchema).optional(),
      scoring: scoringInputSchema.optional(),
      movWeight: z.number().min(0).max(2).optional(),
      skillBands: z
        .array(skillBandInputSchema)
        .min(1, 'At least one skill band is required'),
      playStyles: z
        .array(playStyleInputSchema)
        .min(1, 'At least one play style is required'),
      positions: z.array(positionInputSchema).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.formats && data.formats.length > 0) {
        const defaultFormats = data.formats.filter((f) => f.isDefault);
        if (defaultFormats.length !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Exactly one format must be marked as default (isDefault: true)',
            path: ['formats'],
          });
        }

        for (let i = 0; i < data.formats.length; i++) {
          const totalPlayers = data.formats[i].playersPerSide * 2;
          if (totalPlayers < data.minPlayers || totalPlayers > data.maxPlayers) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Format ${data.formats[i].key} (capacity ${totalPlayers}) must be within sport minPlayers (${data.minPlayers}) and maxPlayers (${data.maxPlayers})`,
              path: ['formats', i],
            });
          }
        }
      }
    }),
});

export const updateSportSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, 'Sport ID is required'),
  }),
  body: z
    .object({
      name: z.string().trim().min(2).optional(),
      isActive: z.boolean().optional(),
      isTeamBased: z.boolean().optional(),
      allowsDraws: z.boolean().optional(),
      minPlayers: z.number().int().min(1).optional(),
      maxPlayers: z.number().int().min(1).optional(),
      formats: z.array(formatInputSchema).optional(),
      scoring: scoringInputSchema.optional(),
      movWeight: z.number().min(0).max(2).optional(),
      skillBands: z.array(skillBandInputSchema).optional(),
      playStyles: z.array(playStyleInputSchema).optional(),
      positions: z.array(positionInputSchema).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.formats && data.formats.length > 0) {
        const defaultFormats = data.formats.filter((f) => f.isDefault);
        if (defaultFormats.length !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Exactly one format must be marked as default (isDefault: true)',
            path: ['formats'],
          });
        }
      }
    }),
});
