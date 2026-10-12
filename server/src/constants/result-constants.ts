export const ResultStatuses = {
  PENDING_CONFIRMATION: 'pending_confirmation',
  VERIFIED: 'verified',
  DISPUTED: 'disputed',
  RESOLVED: 'resolved',
  NO_RESULT: 'no_result',
  VOIDED: 'voided',
} as const;

export type ResultStatus = (typeof ResultStatuses)[keyof typeof ResultStatuses];

export const RatingStatuses = {
  NOT_PROCESSED: 'not_processed',
  APPLIED: 'applied',
  VOIDED: 'voided',
} as const;

export type RatingStatus = (typeof RatingStatuses)[keyof typeof RatingStatuses];
