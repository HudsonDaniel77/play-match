import { z } from 'zod';

export const RecommendationFactorSchema = z.object({
  name: z.string(),
  value: z.number(),
  weight: z.number(),
});

export const RecommendationItemSchema = z.object({
  gameId: z.string(),
  sportKey: z.string(),
  title: z.string(),
  score: z.number().min(0).max(1),
  confidence: z.enum(['low', 'medium', 'high']),
  factors: z.array(RecommendationFactorSchema),
  reasons: z.array(z.string()),
});

export const RecommendationsResponseSchema = z.object({
  items: z.array(RecommendationItemSchema),
});

export type RecommendationFactor = z.infer<typeof RecommendationFactorSchema>;
export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;
export type RecommendationsResponse = z.infer<typeof RecommendationsResponseSchema>;
