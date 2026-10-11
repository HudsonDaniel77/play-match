import { z } from 'zod';

export const ReliabilityScoreSchema = z.object({
  score: z.number().min(0).max(100),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  gamesCounted: z.number().int().min(0),
  onTimeLeaves: z.number().int().min(0),
  lateLeaves: z.number().int().min(0),
  noShows: z.number().int().min(0),
});

export const ProfileReliabilityResponseSchema = z.object({
  userId: z.string(),
  reliability: ReliabilityScoreSchema,
});

export type ReliabilityScore = z.infer<typeof ReliabilityScoreSchema>;
export type ProfileReliabilityResponse = z.infer<typeof ProfileReliabilityResponseSchema>;
