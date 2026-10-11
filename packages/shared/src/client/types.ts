export interface ApiErrorDetails {
  field?: string;
  message: string;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: ApiErrorDetails[];

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: ApiErrorDetails[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface ApiResponseEnvelope<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetails[];
  };
}

export interface PlatformAuthAdapter {
  clientType: 'web' | 'mobile';
  getAccessToken(): Promise<string | null> | string | null;
  setAccessToken(token: string | null): Promise<void> | void;
  getRefreshToken?(): Promise<string | null> | string | null;
  setRefreshToken?(token: string | null): Promise<void> | void;
  clearSession(): Promise<void> | void;
  prepareHeaders(headers: Record<string, string>): Record<string, string>;
  prepareRefreshPayload(): Promise<Record<string, unknown> | undefined>;
  handleRefreshResponse(data: { accessToken: string; refreshToken?: string }): Promise<void> | void;
  acquireRefreshLock?<T>(fn: () => Promise<T>): Promise<T>;
}

export interface ClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  pollingIntervalMs?: number;
  features?: {
    recommendationsMode?: 'mock' | 'live';
    teamsMode?: 'mock' | 'live';
    resultsMode?: 'mock' | 'live';
    notificationsMode?: 'mock' | 'live';
    reliabilityMode?: 'mock' | 'live';
  };
}
