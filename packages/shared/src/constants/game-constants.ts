export const GameStatuses = {
  OPEN: 'open',
  FULL: 'full',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export type GameStatus = (typeof GameStatuses)[keyof typeof GameStatuses];

export const ParticipantStatuses = {
  JOINED: 'joined',
  REQUESTED: 'requested',
  WAITLISTED: 'waitlisted',
  DECLINED: 'declined',
  LEFT: 'left',
  REMOVED: 'removed',
  EXPIRED: 'expired',
} as const;

export type ParticipantStatus = (typeof ParticipantStatuses)[keyof typeof ParticipantStatuses];

export const JoinPolicies = {
  OPEN: 'open',
  APPROVAL: 'approval',
} as const;

export type JoinPolicy = (typeof JoinPolicies)[keyof typeof JoinPolicies];

export const GameVisibilities = {
  PUBLIC: 'public',
  PRIVATE: 'private',
} as const;

export type GameVisibility = (typeof GameVisibilities)[keyof typeof GameVisibilities];

export const EligibilityReasonCodes = {
  ELIGIBLE: 'eligible',
  ONBOARDING_INCOMPLETE: 'onboarding_incomplete',
  SPORT_PROFILE_MISSING: 'sport_profile_missing',
  RATING_TRACK_MISSING: 'rating_track_missing',
  RATING_BELOW_MIN: 'rating_below_min',
  RATING_ABOVE_MAX: 'rating_above_max',
  OUTSIDE_RATING_RANGE: 'outside_rating_range',
  SCHEDULE_CONFLICT: 'schedule_conflict',
  GAME_NOT_JOINABLE: 'game_not_joinable',
  JOIN_CUTOFF_PASSED: 'join_cutoff_passed',
  ALREADY_PARTICIPANT: 'already_participant',
  WAITLIST_FULL: 'waitlist_full',
  HOST_CANNOT_JOIN: 'host_cannot_join',
} as const;

export type EligibilityReasonCode =
  (typeof EligibilityReasonCodes)[keyof typeof EligibilityReasonCodes];
