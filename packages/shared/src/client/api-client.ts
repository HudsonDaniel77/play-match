import {
  ApiError,
  type ApiResponseEnvelope,
  type ApiErrorEnvelope,
  type PlatformAuthAdapter,
  type ClientConfig,
} from './types.js';
import { normalizePayload, type NormalizeIds } from './normalize.js';

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  skipAuth?: boolean;
}

export type LoggedOutListener = () => void;

export class ApiClient {
  private config: ClientConfig;
  private adapter: PlatformAuthAdapter;
  private refreshPromise: Promise<string> | null = null;
  private loggedOutListeners: Set<LoggedOutListener> = new Set();

  constructor(config: ClientConfig, adapter: PlatformAuthAdapter) {
    this.config = config;
    this.adapter = adapter;
  }

  public onLoggedOut(listener: LoggedOutListener): () => void {
    this.loggedOutListeners.add(listener);
    return () => {
      this.loggedOutListeners.delete(listener);
    };
  }

  private notifyLoggedOut(): void {
    for (const listener of this.loggedOutListeners) {
      try {
        listener();
      } catch {
        // Suppress listener error
      }
    }
  }

  public getAdapter(): PlatformAuthAdapter {
    return this.adapter;
  }

  public getConfig(): ClientConfig {
    return this.config;
  }

  /**
   * Single-flight token refresh with platform lock support.
   */
  public async refreshSession(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const performRefresh = async (): Promise<string> => {
      try {
        const payload = await this.adapter.prepareRefreshPayload();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const preparedHeaders = this.adapter.prepareHeaders(headers);

        const response = await fetch(`${this.config.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: preparedHeaders,
          body: payload ? JSON.stringify(payload) : undefined,
          credentials: this.adapter.clientType === 'web' ? 'include' : 'same-origin',
        });

        if (!response.ok) {
          const errorJson = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
          throw new ApiError(
            errorJson?.error?.message || 'Session refresh failed',
            errorJson?.error?.code || 'AUTH_TOKEN_INVALID',
            response.status,
            errorJson?.error?.details,
          );
        }

        const json = (await response.json()) as ApiResponseEnvelope<{
          accessToken: string;
          refreshToken?: string;
        }>;

        await this.adapter.handleRefreshResponse(json.data);
        return json.data.accessToken;
      } catch (err) {
        await this.adapter.clearSession();
        this.notifyLoggedOut();
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    };

    if (this.adapter.acquireRefreshLock) {
      this.refreshPromise = this.adapter.acquireRefreshLock(performRefresh);
    } else {
      this.refreshPromise = performRefresh();
    }

    return this.refreshPromise;
  }

  /**
   * Main typed request method with unwrapping, normalization, timeout and retry logic.
   */
  public async request<T>(
    endpoint: string,
    options: RequestOptions = {},
    isRetry = false,
  ): Promise<NormalizeIds<T>> {
    const { timeoutMs = this.config.timeoutMs || 15000, skipAuth = false, ...fetchOptions } = options;

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.config.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) || {}),
    };

    if (!skipAuth) {
      const token = await this.adapter.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const preparedHeaders = this.adapter.prepareHeaders(headers);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (fetchOptions.signal) {
      fetchOptions.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: preparedHeaders,
        signal: controller.signal,
        credentials: this.adapter.clientType === 'web' ? 'include' : 'same-origin',
      });

      clearTimeout(timeoutId);

      // Handle 401 Unauthorized with single-flight refresh and retry
      if (response.status === 401 && !skipAuth && !isRetry) {
        try {
          await this.refreshSession();
          return await this.request<T>(endpoint, options, true);
        } catch {
          throw new ApiError('Unauthorized', 'AUTH_UNAUTHORIZED', 401);
        }
      }

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
        throw new ApiError(
          errorJson?.error?.message || `HTTP ${response.status}`,
          errorJson?.error?.code || 'UNKNOWN_ERROR',
          response.status,
          errorJson?.error?.details,
        );
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as unknown as NormalizeIds<T>;
      }

      const json = await response.json();

      // Unwrap standard response envelope
      const rawData = json && typeof json === 'object' && 'data' in json ? json.data : json;

      // Normalize _id to id and strip forbidden runtime fields
      return normalizePayload(rawData) as NormalizeIds<T>;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new ApiError('Request timed out or cancelled', 'REQUEST_TIMEOUT', 408);
      }
      if (err instanceof ApiError) {
        throw err;
      }
      throw new ApiError(err?.message || 'Network request failed', 'NETWORK_ERROR', 0);
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<NormalizeIds<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<NormalizeIds<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<NormalizeIds<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<NormalizeIds<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}
