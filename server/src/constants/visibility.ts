export const ProfileVisibility = {
  PUBLIC: 'public',
  FRIENDS: 'friends',
  PRIVATE: 'private',
} as const;

export type ProfileVisibilityType =
  (typeof ProfileVisibility)[keyof typeof ProfileVisibility];

export const LocationVisibility = {
  COARSENED: 'coarsened',
  HIDDEN: 'hidden',
} as const;

export type LocationVisibilityType =
  (typeof LocationVisibility)[keyof typeof LocationVisibility];

export const RatingVisibility = {
  PUBLIC: 'public',
  HIDDEN: 'hidden',
} as const;

export type RatingVisibilityType =
  (typeof RatingVisibility)[keyof typeof RatingVisibility];
