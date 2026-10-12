import { ExplanationCodes, type ExplanationCode } from '../../constants/explanation-codes.js';

export interface ExplanationInput {
  oldRating: number;
  newRating: number;
  delta: number;
  expectedScore: number;
  outcomeScore: number;
  ownTeamRating: number;
  opponentTeamRating: number;
  kUsed: number;
  kBaseTier: number;
  inactivityMultiplier: number;
  movMultiplier: number;
  gamesPlayedBefore: number;
  bandBefore: { key: string; label: string };
  bandAfter: { key: string; label: string };
}

export interface StructuredExplanation {
  codes: ExplanationCode[];
  metrics: {
    delta: number;
    oldRating: number;
    newRating: number;
    winProbabilityPercent: number;
    kFactorUsed: number;
    kBaseTier: number;
    ratingDifference: number;
    marginMultiplier: number;
    inactivityMultiplier: number;
  };
  explanationText: string;
}

export function buildRatingExplanation(input: ExplanationInput): StructuredExplanation {
  const codes: ExplanationCode[] = [];
  const sentences: string[] = [];

  const winProbabilityPercent = Math.round(input.expectedScore * 1000) / 10;
  const ratingDiff = Math.round((input.opponentTeamRating - input.ownTeamRating) * 10) / 10;
  const absDiff = Math.abs(ratingDiff);

  // 1. Outcome & Expectation
  if (input.outcomeScore === 1.0) {
    codes.push(ExplanationCodes.OUTCOME_WIN);
    if (input.expectedScore < 0.5) {
      codes.push(ExplanationCodes.UPSET_VICTORY);
      sentences.push(
        `You gained ${input.delta > 0 ? `+${input.delta}` : input.delta} points because you defeated an opponent rated ${absDiff} points higher than your team.`,
      );
      sentences.push(
        `Your estimated win chance was ${winProbabilityPercent}%, so this victory was an upset that strongly rewarded your performance.`,
      );
    } else {
      codes.push(ExplanationCodes.EXPECTED_VICTORY);
      sentences.push(
        `You gained ${input.delta > 0 ? `+${input.delta}` : input.delta} points with a victory against an opponent rated ${absDiff} points below your team.`,
      );
      sentences.push(
        `Your estimated win chance was ${winProbabilityPercent}%, reflecting an expected outcome.`,
      );
    }
  } else if (input.outcomeScore === 0.0) {
    codes.push(ExplanationCodes.OUTCOME_LOSS);
    if (input.expectedScore > 0.5) {
      codes.push(ExplanationCodes.UPSET_LOSS);
      sentences.push(
        `You lost ${Math.abs(input.delta)} points after being defeated by an opponent rated ${absDiff} points below your team.`,
      );
      sentences.push(
        `Your estimated win chance was ${winProbabilityPercent}%, making this an unexpected loss that carried a steeper rating deduction.`,
      );
    } else {
      codes.push(ExplanationCodes.EXPECTED_LOSS);
      sentences.push(
        `You lost ${Math.abs(input.delta)} points against a higher-rated opponent (${absDiff} points above your team).`,
      );
      sentences.push(
        `Your estimated win chance was ${winProbabilityPercent}%, cushioning the rating impact against a tough adversary.`,
      );
    }
  } else {
    codes.push(ExplanationCodes.OUTCOME_DRAW);
    sentences.push(
      `You earned ${input.delta >= 0 ? `+${input.delta}` : input.delta} points from a draw against an opponent rated ${absDiff} points ${ratingDiff > 0 ? 'above' : 'below'} your team.`,
    );
    sentences.push(`Your expected score was ${winProbabilityPercent}%.`);
  }

  // 2. K-Factor & Inactivity
  sentences.push(
    `Your base K-factor was ${input.kBaseTier} based on having played ${input.gamesPlayedBefore} prior games.`,
  );

  if (input.inactivityMultiplier > 1.0) {
    codes.push(ExplanationCodes.INACTIVITY_BOOST_APPLIED);
    sentences.push(
      `An inactivity adjustment of ${input.inactivityMultiplier}x was applied to accelerate rating recalibration after time away.`,
    );
  }

  // 3. Margin of Victory
  if (input.movMultiplier > 1.0) {
    codes.push(ExplanationCodes.MOV_BOOST_APPLIED);
    sentences.push(
      `A margin multiplier of ${Math.round(input.movMultiplier * 100) / 100}x was factored into the score difference.`,
    );
  }

  // 4. Band progression
  if (input.bandBefore.key !== input.bandAfter.key) {
    if (input.newRating > input.oldRating) {
      codes.push(ExplanationCodes.BAND_PROMOTION);
      sentences.push(
        `Skill Tier Promotion: You moved up from ${input.bandBefore.label} to ${input.bandAfter.label}!`,
      );
    } else {
      codes.push(ExplanationCodes.BAND_DEMOTION);
      sentences.push(
        `Skill Tier Adjustment: Your rank adjusted from ${input.bandBefore.label} to ${input.bandAfter.label}.`,
      );
    }
  } else {
    codes.push(ExplanationCodes.BAND_UNCHANGED);
  }

  return {
    codes,
    metrics: {
      delta: input.delta,
      oldRating: input.oldRating,
      newRating: input.newRating,
      winProbabilityPercent,
      kFactorUsed: input.kUsed,
      kBaseTier: input.kBaseTier,
      ratingDifference: ratingDiff,
      marginMultiplier: input.movMultiplier,
      inactivityMultiplier: input.inactivityMultiplier,
    },
    explanationText: sentences.join(' '),
  };
}
