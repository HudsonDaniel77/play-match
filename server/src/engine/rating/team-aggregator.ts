export interface TeamRatingAggregator {
  aggregate(ratings: number[]): number;
}

export class MeanTeamRatingAggregator implements TeamRatingAggregator {
  public aggregate(ratings: number[]): number {
    if (ratings.length === 0) {
      return 0;
    }
    const sum = ratings.reduce((acc, r) => acc + r, 0);
    return sum / ratings.length;
  }
}

export function getTeamAggregator(strategy = 'mean'): TeamRatingAggregator {
  switch (strategy.toLowerCase()) {
    case 'mean':
    default:
      return new MeanTeamRatingAggregator();
  }
}
