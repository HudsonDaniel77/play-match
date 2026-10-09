export const DaysOfWeek = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

export type DayOfWeek = (typeof DaysOfWeek)[keyof typeof DaysOfWeek];

export const ALL_DAYS_OF_WEEK: readonly DayOfWeek[] = [
  DaysOfWeek.SUNDAY,
  DaysOfWeek.MONDAY,
  DaysOfWeek.TUESDAY,
  DaysOfWeek.WEDNESDAY,
  DaysOfWeek.THURSDAY,
  DaysOfWeek.FRIDAY,
  DaysOfWeek.SATURDAY,
] as const;
