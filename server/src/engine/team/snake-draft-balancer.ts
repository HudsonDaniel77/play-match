import {
  TEAM_FORMATION_SIDE_ORDER,
  TeamBalanceMethods,
  TeamDisplayNames,
  type TeamSideKey,
} from '../../constants/team-constants.js';

export interface DraftPlayerInput {
  userId: string;
  displayName: string;
  rating: number;
  position?: string;
}

export interface DraftTeamPlayer {
  userId: string;
  displayName: string;
  rating: number;
  position?: string;
}

export interface DraftTeamOutput {
  sideKey: TeamSideKey;
  name: string;
  players: DraftTeamPlayer[];
  ratingTotal: number;
  ratingAverage: number;
}

export interface SnakeDraftResult {
  teams: DraftTeamOutput[];
  balance: {
    difference: number;
    method: typeof TeamBalanceMethods.SNAKE_DRAFT_ELO;
  };
  reasons: string[];
}

function sumRatings(players: DraftTeamPlayer[]): number {
  return players.reduce((acc, p) => acc + p.rating, 0);
}

function averageRating(players: DraftTeamPlayer[]): number {
  if (players.length === 0) {
    return 0;
  }
  return sumRatings(players) / players.length;
}

/**
 * Snake draft: sort by descending Elo, alternate pick direction each round across two teams.
 */
export function balanceTeamsSnakeDraft(players: DraftPlayerInput[]): SnakeDraftResult {
  const sorted = [...players].sort((a, b) => {
    if (b.rating !== a.rating) {
      return b.rating - a.rating;
    }
    return a.userId.localeCompare(b.userId);
  });

  const teamBuckets: DraftTeamPlayer[][] = [[], []];

  for (let i = 0; i < sorted.length; i++) {
    const round = Math.floor(i / TEAM_FORMATION_SIDE_ORDER.length);
    const posInRound = i % TEAM_FORMATION_SIDE_ORDER.length;
    const teamIdx =
      round % 2 === 0
        ? posInRound
        : TEAM_FORMATION_SIDE_ORDER.length - 1 - posInRound;
    teamBuckets[teamIdx].push({
      userId: sorted[i].userId,
      displayName: sorted[i].displayName,
      rating: sorted[i].rating,
      position: sorted[i].position,
    });
  }

  const teams: DraftTeamOutput[] = TEAM_FORMATION_SIDE_ORDER.map((sideKey, idx) => {
    const roster = teamBuckets[idx];
    const ratingTotal = sumRatings(roster);
    return {
      sideKey,
      name: TeamDisplayNames[sideKey],
      players: roster,
      ratingTotal,
      ratingAverage: averageRating(roster),
    };
  });

  const difference = Math.abs(teams[0].ratingTotal - teams[1].ratingTotal);
  const reasons = [
    `Snake draft assigned ${sorted.length} players by descending Elo rating`,
    `Rating totals: ${teams[0].name} ${teams[0].ratingTotal}, ${teams[1].name} ${teams[1].ratingTotal}`,
    `Absolute rating total difference: ${difference}`,
  ];

  return {
    teams,
    balance: {
      difference,
      method: TeamBalanceMethods.SNAKE_DRAFT_ELO,
    },
    reasons,
  };
}
