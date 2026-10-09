export const ClientTypes = {
  WEB: 'web',
  MOBILE: 'mobile',
} as const;

export type ClientType = (typeof ClientTypes)[keyof typeof ClientTypes];

export const ALL_CLIENT_TYPES: readonly ClientType[] = [
  ClientTypes.WEB,
  ClientTypes.MOBILE,
] as const;

export const DEFAULT_CLIENT_TYPE: ClientType = ClientTypes.WEB;

export const CLIENT_TYPE_HEADER = 'x-client-type';
