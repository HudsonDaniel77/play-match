import { z } from 'zod';

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

export const createSportSchema = z.object({
  body: z.object({
    key: z
      .string()
      .trim()
      .min(2, 'Sport key must be at least 2 characters')
      .regex(/^[a-z0-9_-]+$/, 'Sport key must contain only lowercase alphanumeric characters, dashes, or underscores'),
    name: z.string().trim().min(2, 'Sport name must be at least 2 characters'),
    isActive: z.boolean().optional(),
    isTeamBased: z.boolean().optional(),
    minPlayers: z.number().int().min(1, 'minPlayers must be at least 1'),
    maxPlayers: z.number().int().min(1, 'maxPlayers must be at least 1'),
    skillBands: z
      .array(skillBandInputSchema)
      .min(1, 'At least one skill band is required'),
    playStyles: z
      .array(playStyleInputSchema)
      .min(1, 'At least one play style is required'),
    positions: z.array(positionInputSchema).optional(),
  }),
});

export const updateSportSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, 'Sport ID is required'),
  }),
  body: z.object({
    name: z.string().trim().min(2).optional(),
    isActive: z.boolean().optional(),
    isTeamBased: z.boolean().optional(),
    minPlayers: z.number().int().min(1).optional(),
    maxPlayers: z.number().int().min(1).optional(),
    skillBands: z.array(skillBandInputSchema).optional(),
    playStyles: z.array(playStyleInputSchema).optional(),
    positions: z.array(positionInputSchema).optional(),
  }),
});
