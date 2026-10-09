export const OnboardingSteps = {
  BASIC_INFO: 'basic_info',
  SPORTS: 'sports',
  AVAILABILITY: 'availability',
  LOCATION: 'location',
  PREFERENCES: 'preferences',
} as const;

export type OnboardingStep =
  (typeof OnboardingSteps)[keyof typeof OnboardingSteps];

export const ALL_ONBOARDING_STEPS: readonly OnboardingStep[] = [
  OnboardingSteps.BASIC_INFO,
  OnboardingSteps.SPORTS,
  OnboardingSteps.AVAILABILITY,
  OnboardingSteps.LOCATION,
  OnboardingSteps.PREFERENCES,
] as const;

export const OnboardingStatuses = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export type OnboardingStatus =
  (typeof OnboardingStatuses)[keyof typeof OnboardingStatuses];
