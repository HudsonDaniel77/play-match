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

export const ParticipantRoles = {
  HOST: 'host',
  PLAYER: 'player',
} as const;

export type ParticipantRole = (typeof ParticipantRoles)[keyof typeof ParticipantRoles];

export const ParticipantStatuses = {
  JOINED: 'joined',
  REQUESTED: 'requested',
  WAITLISTED: 'waitlisted',
  DECLINED: 'declined',
  LEFT: 'left',
  REMOVED: 'removed',
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

export const LeaveTypes = {
  ON_TIME: 'on_time',
  LATE: 'late',
} as const;

export type LeaveType = (typeof LeaveTypes)[keyof typeof LeaveTypes];

export const CancellationReasonCodes = {
  HOST_CANCELLED: 'host_cancelled',
  WEATHER: 'weather',
  VENUE_UNAVAILABLE: 'venue_unavailable',
  INSUFFICIENT_PLAYERS: 'insufficient_players',
  ADMIN_ACTION: 'admin_action',
  OTHER: 'other',
} as const;

export type CancellationReasonCode = (typeof CancellationReasonCodes)[keyof typeof CancellationReasonCodes];

export const GameEventTypes = {
  GAME_CREATED: 'game_created',
  GAME_EDITED: 'game_edited',
  PARTICIPANT_JOINED: 'participant_joined',
  PARTICIPANT_REQUESTED: 'participant_requested',
  PARTICIPANT_WAITLISTED: 'participant_waitlisted',
  PARTICIPANT_APPROVED: 'participant_approved',
  PARTICIPANT_DECLINED: 'participant_declined',
  PARTICIPANT_LEFT: 'participant_left',
  PARTICIPANT_REMOVED: 'participant_removed',
  PARTICIPANT_PROMOTED: 'participant_promoted',
  GAME_CONFIRMED: 'game_confirmed',
  GAME_CANCELLED: 'game_cancelled',
  GAME_EXPIRED: 'game_expired',
  WAITLIST_EXPIRED: 'waitlist_expired',
  REQUEST_EXPIRED: 'request_expired',
  STATUS_CHANGED: 'status_changed',
  TEAMS_GENERATED: 'teams_generated',
  RESULT_SUBMITTED: 'game.result_submitted',
  RESULT_VERIFIED: 'game.result_verified',
  RESULT_DISPUTED: 'game.result_disputed',
} as const;

export type GameEventType = (typeof GameEventTypes)[keyof typeof GameEventTypes];

export const EligibilityReasonCodes = {
  ELIGIBLE: 'eligible',
  ONBOARDING_INCOMPLETE: 'onboarding_incomplete',
  SPORT_PROFILE_MISSING: 'sport_profile_missing',
  SPORT_NOT_IN_PROFILE: 'sport_profile_missing',
  RATING_TRACK_MISSING: 'rating_track_missing',
  RATING_BELOW_MIN: 'rating_below_min',
  RATING_ABOVE_MAX: 'rating_above_max',
  OUTSIDE_RATING_RANGE: 'outside_rating_range',
  SCHEDULE_CONFLICT: 'schedule_conflict',
  GAME_NOT_JOINABLE: 'game_not_joinable',
  GAME_NOT_OPEN: 'game_not_joinable',
  JOIN_CUTOFF_PASSED: 'join_cutoff_passed',
  PAST_JOIN_CUTOFF: 'join_cutoff_passed',
  ALREADY_PARTICIPANT: 'already_participant',
  WAITLIST_FULL: 'waitlist_full',
  HOST_CANNOT_JOIN: 'host_cannot_join',
} as const;

export type EligibilityReasonCode = (typeof EligibilityReasonCodes)[keyof typeof EligibilityReasonCodes];

/**
 * Strict state transition table
 */
export const AllowedGameTransitions: Record<GameStatus, GameStatus[]> = {
  [GameStatuses.OPEN]: [
    GameStatuses.FULL,
    GameStatuses.CONFIRMED,
    GameStatuses.CANCELLED,
    GameStatuses.EXPIRED,
  ],
  [GameStatuses.FULL]: [
    GameStatuses.OPEN,
    GameStatuses.CONFIRMED,
    GameStatuses.CANCELLED,
    GameStatuses.EXPIRED,
  ],
  [GameStatuses.CONFIRMED]: [
    GameStatuses.OPEN,
    GameStatuses.IN_PROGRESS,
    GameStatuses.CANCELLED,
  ],
  [GameStatuses.IN_PROGRESS]: [GameStatuses.COMPLETED],
  [GameStatuses.COMPLETED]: [],
  [GameStatuses.CANCELLED]: [],
  [GameStatuses.EXPIRED]: [],
};
