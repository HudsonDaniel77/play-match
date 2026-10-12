import { z } from 'zod';
import { RECOMMENDATION_LIMITS } from '../constants/recommendation-constants.js';

export const getRecommendationsQuerySchema = z.object({
  query: z.object({
    sportKey: z.string().trim().toLowerCase().optional(),
    limit: z
      .string()
      .regex(/^\d+$/, 'limit must be a positive integer')
      .transform(Number)
      .pipe(
        z
          .number()
          .int()
          .min(1)
          .max(RECOMMENDATION_LIMITS.MAX_LIMIT),
      )
      .optional()
      .default(String(RECOMMENDATION_LIMITS.DEFAULT_LIMIT)),
    maxDistanceKm: z
      .string()
      .transform(Number)
      .pipe(z.number().positive())
      .optional(),
    minScore: z
      .string()
      .transform(Number)
      .pipe(z.number().min(0).max(1))
      .optional(),
  }),
});

export type GetRecommendationsQuery = z.infer<
  typeof getRecommendationsQuerySchema
>['query'];
