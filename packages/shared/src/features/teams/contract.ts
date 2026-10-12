import { z } from 'zod';

export const TeamPlayerSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  rating: z.number(),
  position: z.string().optional(),
});

export const SuggestedTeamSchema = z.object({
  sideKey: z.string(),
  name: z.string(),
  players: z.array(TeamPlayerSchema),
  ratingTotal: z.number(),
  ratingAverage: z.number(),
});

export const TeamBalanceSchema = z.object({
  difference: z.number(),
  method: z.string(),
});

export const TeamSuggestionResponseSchema = z.object({
  teams: z.array(SuggestedTeamSchema),
  balance: TeamBalanceSchema,
  reasons: z.array(z.string()),
});

export type TeamPlayer = z.infer<typeof TeamPlayerSchema>;
export type SuggestedTeam = z.infer<typeof SuggestedTeamSchema>;
export type TeamBalance = z.infer<typeof TeamBalanceSchema>;
export type TeamSuggestionResponse = z.infer<typeof TeamSuggestionResponseSchema>;
