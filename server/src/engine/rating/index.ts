import type {
  RatingEngineConfig,
  MatchSideInput,
  PlayerDeltaCalculation,
  SkillBandDefinition,
} from './interfaces.js';
import { calculateExpectedScore, calculatePlayerDelta, clampAndRoundRating } from './elo.js';
import { getTeamAggregator } from './team-aggregator.js';
import { calculateMarginMultiplier } from './mov.js';
import { determineKFactor } from './k-factor.js';
import { resolveBandLabel } from './band-resolver.js';

export * from './interfaces.js';
export * from './elo.js';
export * from './team-aggregator.js';
export * from './mov.js';
export * from './k-factor.js';
export * from './confidence.js';
export * from './band-resolver.js';
export * from './explanation-builder.js';

export function calculateMatchRatings(
  sideA: MatchSideInput,
  sideB: MatchSideInput,
  config: RatingEngineConfig,
  skillBands: SkillBandDefinition[],
  aggregationStrategy = 'mean',
  currentDate: Date = new Date(),
): PlayerDeltaCalculation[] {
  const aggregator = getTeamAggregator(aggregationStrategy);

  const teamRatingA = aggregator.aggregate(sideA.players.map((p) => p.rating));
  const teamRatingB = aggregator.aggregate(sideB.players.map((p) => p.rating));

  // Determine outcome score for side A and side B
  let outcomeScoreA = 0.5;
  let outcomeScoreB = 0.5;
  if (sideA.score > sideB.score) {
    outcomeScoreA = 1.0;
    outcomeScoreB = 0.0;
  } else if (sideA.score < sideB.score) {
    outcomeScoreA = 0.0;
    outcomeScoreB = 1.0;
  }

  // Margin of victory multiplier
  const movMultiplier = calculateMarginMultiplier(
    sideA.score,
    sideB.score,
    config.movEnabled,
    config.movWeight,
  );

  const results: PlayerDeltaCalculation[] = [];

  // Calculate Side A players
  for (const player of sideA.players) {
    // Each player's expected score uses their OWN rating against the OPPOSING team's rating
    const expectedScore = calculateExpectedScore(
      player.rating,
      teamRatingB,
      config.scaleDivisor,
    );

    const kResolution = determineKFactor(
      player.gamesPlayed,
      player.lastRatedAt,
      currentDate,
      config,
    );

    const rawDelta = calculatePlayerDelta(
      kResolution.kEffective,
      movMultiplier,
      outcomeScoreA,
      expectedScore,
    );

    const oldRating = clampAndRoundRating(
      player.rating,
      config.ratingMin,
      config.ratingMax,
      config.ratingDecimals,
    );

    const newRating = clampAndRoundRating(
      player.rating + rawDelta,
      config.ratingMin,
      config.ratingMax,
      config.ratingDecimals,
    );

    const delta = clampAndRoundRating(
      newRating - oldRating,
      -config.ratingMax,
      config.ratingMax,
      config.ratingDecimals,
    );

    const bandBefore = resolveBandLabel(oldRating, skillBands);
    const bandAfter = resolveBandLabel(newRating, skillBands);

    results.push({
      userId: player.userId,
      sideKey: sideA.sideKey,
      oldRating,
      newRating,
      delta,
      expectedScore,
      outcomeScore: outcomeScoreA,
      ownTeamRating: teamRatingA,
      opponentTeamRating: teamRatingB,
      kUsed: kResolution.kEffective,
      kBaseTier: kResolution.kBaseTier,
      inactivityMultiplier: kResolution.inactivityMultiplier,
      movMultiplier,
      gamesPlayedBefore: player.gamesPlayed,
      bandBefore,
      bandAfter,
    });
  }

  // Calculate Side B players
  for (const player of sideB.players) {
    const expectedScore = calculateExpectedScore(
      player.rating,
      teamRatingA,
      config.scaleDivisor,
    );

    const kResolution = determineKFactor(
      player.gamesPlayed,
      player.lastRatedAt,
      currentDate,
      config,
    );

    const rawDelta = calculatePlayerDelta(
      kResolution.kEffective,
      movMultiplier,
      outcomeScoreB,
      expectedScore,
    );

    const oldRating = clampAndRoundRating(
      player.rating,
      config.ratingMin,
      config.ratingMax,
      config.ratingDecimals,
    );

    const newRating = clampAndRoundRating(
      player.rating + rawDelta,
      config.ratingMin,
      config.ratingMax,
      config.ratingDecimals,
    );

    const delta = clampAndRoundRating(
      newRating - oldRating,
      -config.ratingMax,
      config.ratingMax,
      config.ratingDecimals,
    );

    const bandBefore = resolveBandLabel(oldRating, skillBands);
    const bandAfter = resolveBandLabel(newRating, skillBands);

    results.push({
      userId: player.userId,
      sideKey: sideB.sideKey,
      oldRating,
      newRating,
      delta,
      expectedScore,
      outcomeScore: outcomeScoreB,
      ownTeamRating: teamRatingB,
      opponentTeamRating: teamRatingA,
      kUsed: kResolution.kEffective,
      kBaseTier: kResolution.kBaseTier,
      inactivityMultiplier: kResolution.inactivityMultiplier,
      movMultiplier,
      gamesPlayedBefore: player.gamesPlayed,
      bandBefore,
      bandAfter,
    });
  }

  return results;
}
