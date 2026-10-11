export const ReliabilityTiers = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
} as const;

export type ReliabilityTier = (typeof ReliabilityTiers)[keyof typeof ReliabilityTiers];

export const AttendanceStatuses = {
  ATTENDED: 'attended',
  NO_SHOW: 'no_show',
} as const;

export type AttendanceStatus = (typeof AttendanceStatuses)[keyof typeof AttendanceStatuses];

export const FEEDBACK_NOTE_MAX_LENGTH = 300;

export const ReliabilityEventTypes = {
  FEEDBACK_SUBMITTED: 'game.feedback_submitted',
} as const;
