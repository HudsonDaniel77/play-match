import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const gameTeamsParamsSchema = z.object({
  params: z.object({
    gameId: z
      .string()
      .trim()
      .regex(objectIdRegex, 'gameId must be a valid 24-character hexadecimal ObjectId'),
  }),
});

export const generateTeamsSchema = gameTeamsParamsSchema.extend({
  body: z.object({}).strict().optional(),
});
