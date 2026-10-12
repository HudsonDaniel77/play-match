import { z } from 'zod';

export const GameResultStatusSchema = z.enum([
  'pending_confirmation',
  'verified',
  'disputed',
  'resolved',
  'no_result',
  'voided',
]);

export const TeamResultScoreSchema = z.object({
  sideKey: z.string(),
  score: z.number(),
  winner: z.boolean(),
});

export const GameResultProposalSchema = z.object({
  proposedByUserId: z.string(),
  proposedAt: z.string(),
  scores: z.array(TeamResultScoreSchema),
  notes: z.string().optional(),
});

export const GameResultResponseSchema = z.object({
  gameId: z.string(),
  status: GameResultStatusSchema,
  proposal: GameResultProposalSchema.optional(),
  whoMustActNext: z.array(z.string()),
  ratingStatus: z.enum(['not_processed', 'applied', 'voided']),
  notRatedReasons: z.array(z.string()).optional(),
});

export type GameResultStatus = z.infer<typeof GameResultStatusSchema>;
export type TeamResultScore = z.infer<typeof TeamResultScoreSchema>;
export type GameResultProposal = z.infer<typeof GameResultProposalSchema>;
export type GameResultResponse = z.infer<typeof GameResultResponseSchema>;
