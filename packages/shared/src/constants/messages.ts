import { ErrorCodes, type ErrorCode } from './error-codes.js';
import { EligibilityReasonCodes, type EligibilityReasonCode } from './game-constants.js';

/**
 * Message translation keys mapping error and eligibility codes to UI keys.
 * No hardcoded UI English inside domain logic.
 */
export const ErrorMessageKeys: Record<ErrorCode, string> = {
  [ErrorCodes.UNKNOWN_ERROR]: 'errors.unknown',
  [ErrorCodes.VALIDATION_ERROR]: 'errors.validation',
  [ErrorCodes.REQUEST_TIMEOUT]: 'errors.timeout',
  [ErrorCodes.NETWORK_ERROR]: 'errors.network',
  [ErrorCodes.FEATURE_NOT_AVAILABLE]: 'errors.feature_not_available',
  [ErrorCodes.AUTH_UNAUTHORIZED]: 'auth.errors.unauthorized',
  [ErrorCodes.AUTH_FORBIDDEN]: 'auth.errors.forbidden',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'auth.errors.token_expired',
  [ErrorCodes.AUTH_TOKEN_INVALID]: 'auth.errors.token_invalid',
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'auth.errors.invalid_credentials',
  [ErrorCodes.AUTH_EMAIL_NOT_VERIFIED]: 'auth.errors.email_not_verified',
  [ErrorCodes.AUTH_ACCOUNT_LOCKED]: 'auth.errors.account_locked',
  [ErrorCodes.AUTH_ACCOUNT_SUSPENDED]: 'auth.errors.account_suspended',
  [ErrorCodes.AUTH_EMAIL_ALREADY_EXISTS]: 'auth.errors.email_already_exists',
  [ErrorCodes.AUTH_REFRESH_TOKEN_REUSED]: 'auth.errors.session_revoked',
  [ErrorCodes.PROFILE_NOT_FOUND]: 'profile.errors.not_found',
  [ErrorCodes.ONBOARDING_INCOMPLETE]: 'onboarding.errors.incomplete',
  [ErrorCodes.SPORT_NOT_FOUND]: 'sports.errors.not_found',
  [ErrorCodes.SPORT_INACTIVE]: 'sports.errors.inactive',
  [ErrorCodes.GAME_NOT_FOUND]: 'games.errors.not_found',
  [ErrorCodes.GAME_FULL]: 'games.errors.full',
  [ErrorCodes.GAME_STATUS_INVALID]: 'games.errors.status_invalid',
  [ErrorCodes.GAME_TIME_INVALID]: 'games.errors.time_invalid',
  [ErrorCodes.GAME_HOST_CANNOT_LEAVE]: 'games.errors.host_cannot_leave',
  [ErrorCodes.PARTICIPANT_ALREADY_JOINED]: 'games.errors.already_joined',
  [ErrorCodes.PARTICIPANT_NOT_FOUND]: 'games.errors.participant_not_found',
  [ErrorCodes.PARTICIPANT_ELIGIBILITY_FAILED]: 'games.errors.eligibility_failed',
  [ErrorCodes.VENUE_NOT_FOUND]: 'venues.errors.not_found',
  [ErrorCodes.VENUE_NOT_ACTIVE]: 'venues.errors.not_active',
  [ErrorCodes.COURT_NOT_FOUND]: 'venues.errors.court_not_found',
  [ErrorCodes.COURT_UNAVAILABLE]: 'venues.errors.court_unavailable',
};

export const EligibilityMessageKeys: Record<EligibilityReasonCode, string> = {
  [EligibilityReasonCodes.ELIGIBLE]: 'eligibility.eligible',
  [EligibilityReasonCodes.ONBOARDING_INCOMPLETE]: 'eligibility.onboarding_incomplete',
  [EligibilityReasonCodes.SPORT_PROFILE_MISSING]: 'eligibility.sport_missing',
  [EligibilityReasonCodes.RATING_TRACK_MISSING]: 'eligibility.rating_missing',
  [EligibilityReasonCodes.RATING_BELOW_MIN]: 'eligibility.rating_below_min',
  [EligibilityReasonCodes.RATING_ABOVE_MAX]: 'eligibility.rating_above_max',
  [EligibilityReasonCodes.OUTSIDE_RATING_RANGE]: 'eligibility.outside_rating_range',
  [EligibilityReasonCodes.SCHEDULE_CONFLICT]: 'eligibility.schedule_conflict',
  [EligibilityReasonCodes.GAME_NOT_JOINABLE]: 'eligibility.game_not_joinable',
  [EligibilityReasonCodes.JOIN_CUTOFF_PASSED]: 'eligibility.cutoff_passed',
  [EligibilityReasonCodes.ALREADY_PARTICIPANT]: 'eligibility.already_participant',
  [EligibilityReasonCodes.WAITLIST_FULL]: 'eligibility.waitlist_full',
  [EligibilityReasonCodes.HOST_CANNOT_JOIN]: 'eligibility.host_cannot_join',
};
