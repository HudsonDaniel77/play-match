export const VenueStatuses = {
  PENDING_APPROVAL: 'pending_approval',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
} as const;

export type VenueStatus = (typeof VenueStatuses)[keyof typeof VenueStatuses];

export const VenueEventTypes = {
  VENUE_CREATED: 'venue.created',
  VENUE_APPROVED: 'venue.approved',
  VENUE_SUSPENDED: 'venue.suspended',
  VENUE_REINSTATED: 'venue.reinstated',
  GAME_VENUE_CHANGED: 'game.venue.changed',
} as const;

export type VenueEventType = (typeof VenueEventTypes)[keyof typeof VenueEventTypes];

export const DiscoverySortOptions = {
  DISTANCE: 'distance',
  START_TIME: 'start_time',
} as const;

export type DiscoverySortOption = (typeof DiscoverySortOptions)[keyof typeof DiscoverySortOptions];

export const VenueSuggestionReasons = {
  SUPPORTS_SPORT: 'supports_sport',
  AVAILABLE_AT_TIME: 'available_at_time',
  CLOSEST_TO_GROUP: 'closest_to_group',
  MINIMAL_MAX_TRAVEL: 'minimal_max_travel',
} as const;

export type VenueSuggestionReason =
  (typeof VenueSuggestionReasons)[keyof typeof VenueSuggestionReasons];
