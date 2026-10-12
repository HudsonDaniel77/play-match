import type { PlatformAuthAdapter } from '../types.js';

export interface SecureStorageInterface {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const REFRESH_TOKEN_STORAGE_KEY = 'playmatch_mobile_refresh_token';

/**
 * Mobile Platform Auth Adapter:
 * - Keeps access token strictly in memory
 * - Stores rotated refresh token immediately in SecureStore
 * - Sends x-client-type: mobile header
 * - Passes { refreshToken } in body for refresh requests
 */
export class MobileAuthAdapter implements PlatformAuthAdapter {
  public readonly clientType = 'mobile' as const;
  private inMemoryAccessToken: string | null = null;
  private secureStorage: SecureStorageInterface;

  constructor(secureStorage: SecureStorageInterface) {
    this.secureStorage = secureStorage;
  }

  public getAccessToken(): string | null {
    return this.inMemoryAccessToken;
  }

  public setAccessToken(token: string | null): void {
    this.inMemoryAccessToken = token;
  }

  public async getRefreshToken(): Promise<string | null> {
    try {
      return await this.secureStorage.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public async setRefreshToken(token: string | null): Promise<void> {
    try {
      if (token) {
        await this.secureStorage.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, token);
      } else {
        await this.secureStorage.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Graceful fallback
    }
  }

  public async clearSession(): Promise<void> {
    this.inMemoryAccessToken = null;
    try {
      await this.secureStorage.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      // Ignored on clear
    }
  }

  public prepareHeaders(headers: Record<string, string>): Record<string, string> {
    return {
      ...headers,
      'x-client-type': 'mobile',
    };
  }

  public async prepareRefreshPayload(): Promise<Record<string, unknown> | undefined> {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      return undefined;
    }
    return { refreshToken };
  }

  public async handleRefreshResponse(data: { accessToken: string; refreshToken?: string }): Promise<void> {
    this.inMemoryAccessToken = data.accessToken;
    if (data.refreshToken) {
      await this.setRefreshToken(data.refreshToken);
    }
  }
}
