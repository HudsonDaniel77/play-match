import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const gameResultParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .regex(objectIdRegex, 'id must be a valid 24-character hexadecimal ObjectId'),
  }),
});

export const submitResultSchema = gameResultParamsSchema.extend({
  body: z.object({
    scores: z
      .array(
        z.object({
          sideKey: z.string().trim().min(1, 'sideKey is required'),
          score: z.number().int().min(0, 'score must be a non-negative integer'),
          winner: z.boolean(),
        }),
      )
      .min(2, 'At least two sides must have scores reported'),
    notes: z.string().trim().max(500).optional(),
  }),
});

export const verifyResultSchema = gameResultParamsSchema.extend({
  body: z.object({}).strict().optional(),
});

export const disputeResultSchema = gameResultParamsSchema.extend({
  body: z
    .object({
      reason: z.string().trim().max(500).optional(),
    })
    .optional(),
});

export type SubmitResultInput = z.infer<typeof submitResultSchema>['body'];
export type DisputeResultInput = z.infer<typeof disputeResultSchema>['body'];
