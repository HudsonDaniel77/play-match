import { describe, it, expect, vi } from 'vitest';
import { normalizePayload } from '../src/client/normalize.js';
import { ApiClient } from '../src/client/api-client.js';
import { WebAuthAdapter } from '../src/client/adapters/web.js';
import { MobileAuthAdapter, type SecureStorageInterface } from '../src/client/adapters/mobile.js';
import { ApiError } from '../src/client/types.js';

describe('Shared Client Tests', () => {
  describe('ID Normalization & Leaked Fields Stripping', () => {
    it('normalizes _id to id recursively and strips forbidden fields', () => {
      const input = {
        _id: 'user-1',
        name: 'Player One',
        exactDistanceMeters: 1450.5,
        failedLoginAttempts: 3,
        lockUntil: '2026-10-12',
        passwordHash: 'secret-hash',
        profile: {
          _id: 'prof-1',
          bio: 'Badminton player',
        },
        games: [
          { _id: 'game-1', title: 'Singles' },
          { id: 'game-2', _id: 'ignored-under-id', title: 'Doubles' },
        ],
      };

      const normalized = normalizePayload(input);

      // Verifies _id mapped to id
      expect((normalized as any).id).toBe('user-1');
      expect((normalized as any)._id).toBeUndefined();

      // Verifies nested _id mapped
      expect((normalized as any).profile.id).toBe('prof-1');
      expect((normalized as any).profile._id).toBeUndefined();

      // Verifies arrays
      expect((normalized as any).games[0].id).toBe('game-1');
      expect((normalized as any).games[0]._id).toBeUndefined();

      // Verifies preference of id over _id when both exist
      expect((normalized as any).games[1].id).toBe('game-2');
      expect((normalized as any).games[1]._id).toBeUndefined();

      // Verifies forbidden leaked fields are stripped at runtime
      expect((normalized as any).exactDistanceMeters).toBeUndefined();
      expect((normalized as any).failedLoginAttempts).toBeUndefined();
      expect((normalized as any).lockUntil).toBeUndefined();
      expect((normalized as any).passwordHash).toBeUndefined();
    });
  });

  describe('Single-Flight Token Refresh', () => {
    it('ensures 10 concurrent 401 requests trigger exactly ONE refresh call', async () => {
      let refreshCallCount = 0;
      let requestAttempts = 0;

      // Mock fetch
      global.fetch = vi.fn(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/refresh')) {
          refreshCallCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: { accessToken: 'new-valid-token' },
              message: 'Token refreshed',
            }),
          } as any;
        }

        requestAttempts++;
        // First 10 requests fail with 401
        if (requestAttempts <= 10) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              success: false,
              error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
            }),
          } as any;
        }

        // Retried requests succeed with 200
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { message: 'Success' },
            message: 'OK',
          }),
        } as any;
      });

      const adapter = new WebAuthAdapter();
      adapter.setAccessToken('expired-token');
      const client = new ApiClient({ baseUrl: 'http://localhost:5000/api/v1' }, adapter);

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => client.get('/games/me'));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(refreshCallCount).toBe(1); // EXACTLY ONE refresh call
      expect(adapter.getAccessToken()).toBe('new-valid-token');
    });

    it('clears session and triggers onLoggedOut when refresh fails', async () => {
      global.fetch = vi.fn(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/refresh')) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              success: false,
              error: { code: 'AUTH_REFRESH_TOKEN_REUSED', message: 'Session revoked' },
            }),
          } as any;
        }

        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
          }),
        } as any;
      });

      const adapter = new WebAuthAdapter();
      adapter.setAccessToken('expired-token');
      const client = new ApiClient({ baseUrl: 'http://localhost:5000/api/v1' }, adapter);

      const onLoggedOut = vi.fn();
      client.onLoggedOut(onLoggedOut);

      await expect(client.get('/games/me')).rejects.toThrow();

      expect(adapter.getAccessToken()).toBeNull();
      expect(onLoggedOut).toHaveBeenCalledTimes(1);
    });

    it('handles React StrictMode double-invocation cleanly during session restore', async () => {
      let refreshCallCount = 0;

      global.fetch = vi.fn(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/auth/refresh')) {
          refreshCallCount++;
          // Simulate slight network delay
          await new Promise((r) => setTimeout(r, 20));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: { accessToken: 'restored-token' },
              message: 'Restored',
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const adapter = new WebAuthAdapter();
      const client = new ApiClient({ baseUrl: 'http://localhost:5000/api/v1' }, adapter);

      // Simulate React StrictMode executing session restore twice immediately
      const restorePromise1 = client.refreshSession();
      const restorePromise2 = client.refreshSession();

      const [token1, token2] = await Promise.all([restorePromise1, restorePromise2]);

      expect(token1).toBe('restored-token');
      expect(token2).toBe('restored-token');
      expect(refreshCallCount).toBe(1); // Deduped via single-flight
    });
  });

  describe('Mobile Platform Adapter', () => {
    it('saves rotated refresh token immediately to secure storage', async () => {
      const storage: Record<string, string> = {
        playmatch_mobile_refresh_token: 'initial-refresh-token',
      };

      const mockSecureStorage: SecureStorageInterface = {
        getItemAsync: vi.fn(async (k) => storage[k] || null),
        setItemAsync: vi.fn(async (k, v) => {
          storage[k] = v;
        }),
        deleteItemAsync: vi.fn(async (k) => {
          delete storage[k];
        }),
      };

      const adapter = new MobileAuthAdapter(mockSecureStorage);

      const headers = adapter.prepareHeaders({ 'Content-Type': 'application/json' });
      expect(headers['x-client-type']).toBe('mobile');

      const refreshPayload = await adapter.prepareRefreshPayload();
      expect(refreshPayload).toEqual({ refreshToken: 'initial-refresh-token' });

      // Handle rotated token
      await adapter.handleRefreshResponse({
        accessToken: 'new-mobile-access',
        refreshToken: 'rotated-mobile-refresh',
      });

      expect(adapter.getAccessToken()).toBe('new-mobile-access');
      expect(storage['playmatch_mobile_refresh_token']).toBe('rotated-mobile-refresh');

      // Clear session
      await adapter.clearSession();
      expect(adapter.getAccessToken()).toBeNull();
      expect(storage['playmatch_mobile_refresh_token']).toBeUndefined();
    });
  });
});
