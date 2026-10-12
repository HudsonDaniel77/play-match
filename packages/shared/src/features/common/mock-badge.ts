export interface MockBadgeSpec {
  isMock: boolean;
  label: string;
  tooltip: string;
}

export function getMockBadgeSpec(isMock: boolean): MockBadgeSpec {
  return {
    isMock,
    label: isMock ? 'Demo Data' : 'Live Data',
    tooltip: isMock
      ? 'This section displays realistic mock data. Backend implementation in progress.'
      : 'Connected to live platform services.',
  };
}
