import type { PlatformAuthAdapter } from '../types.js';

/**
 * Web Platform Auth Adapter:
 * - Keeps access token strictly in memory
 * - Browser handles httpOnly cookie for refresh token via credentials: 'include'
 * - Serializes refresh across browser tabs using navigator.locks when available
 */
export class WebAuthAdapter implements PlatformAuthAdapter {
  public readonly clientType = 'web' as const;
  private inMemoryAccessToken: string | null = null;

  public getAccessToken(): string | null {
    return this.inMemoryAccessToken;
  }

  public setAccessToken(token: string | null): void {
    this.inMemoryAccessToken = token;
  }

  public clearSession(): void {
    this.inMemoryAccessToken = null;
  }

  public prepareHeaders(headers: Record<string, string>): Record<string, string> {
    return headers;
  }

  public async prepareRefreshPayload(): Promise<Record<string, unknown> | undefined> {
    // Web sends empty body; refresh token is transmitted via httpOnly cookie
    return undefined;
  }

  public handleRefreshResponse(data: { accessToken: string }): void {
    this.inMemoryAccessToken = data.accessToken;
  }

  public async acquireRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && (navigator as any).locks?.request) {
      return (navigator as any).locks.request('playmatch_auth_refresh_lock', async () => {
        return fn();
      });
    }
    // Fallback in environments without Web Locks API
    return fn();
  }
}
