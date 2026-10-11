import { ApiClient } from '@playmatch/shared';
import { MobileAuthAdapter, type SecureStorageInterface } from '@playmatch/shared';

// Simulated SecureStore for the test harness
const storage: Record<string, string> = {};
const mockSecureStorage: SecureStorageInterface = {
  getItemAsync: async (k) => storage[k] || null,
  setItemAsync: async (k, v) => {
    storage[k] = v;
  },
  deleteItemAsync: async (k) => {
    delete storage[k];
  },
};

async function runSingleFlightLiveVerification() {
  console.log('========================================================');
  console.log('🚀 Phase 6: Single-Flight Refresh Verification Against Live Backend');
  console.log('========================================================');

  const baseUrl = 'http://localhost:5000/api/v1';
  const adapter = new MobileAuthAdapter(mockSecureStorage);
  const client = new ApiClient({ baseUrl }, adapter);

  // 1. Log in as demo player 1
  console.log('1. Logging in as player1@playmatch.demo...');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-type': 'mobile',
    },
    body: JSON.stringify({
      email: 'player1@playmatch.demo',
      password: 'DemoSecurePassword2026!',
    }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }

  const loginJson = await loginRes.json();
  const initialAccessToken = loginJson.data.accessToken;
  const initialRefreshToken = loginJson.data.refreshToken;

  console.log('   Logged in successfully.');
  console.log('   Initial Refresh Token:', initialRefreshToken.slice(0, 16) + '...');

  // Save refresh token to storage and set access token on adapter
  await adapter.setRefreshToken(initialRefreshToken);

  // 2. Intentionally inject an expired/invalid access token to trigger 401s
  console.log('2. Injecting intentionally expired access token to trigger 401...');
  adapter.setAccessToken('expired.simulated.token');

  // Monitor refresh calls
  const originalFetch = global.fetch;
  let refreshCallCount = 0;
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes('/auth/refresh')) {
      refreshCallCount++;
    }
    return originalFetch(input, init);
  };

  // 3. Fire 10 concurrent requests simultaneously
  console.log('3. Firing 10 concurrent requests to /games/me with expired token...');
  const endpoints = Array.from({ length: 10 }, () => client.get('/games/me'));
  const results = await Promise.all(endpoints);

  console.log(`4. Concurrent requests resolved: ${results.length}/10 succeeded.`);
  console.log(`   Refresh endpoint call count: ${refreshCallCount} (Expected: exactly 1).`);

  const rotatedRefreshToken = await adapter.getRefreshToken();
  console.log('   Rotated Refresh Token:', rotatedRefreshToken?.slice(0, 16) + '...');
  console.log('   New Active Access Token:', adapter.getAccessToken()?.slice(0, 24) + '...');

  // Assertions
  if (refreshCallCount !== 1) {
    throw new Error(`Assertion failed: Expected 1 refresh call, got ${refreshCallCount}`);
  }

  if (rotatedRefreshToken === initialRefreshToken) {
    throw new Error('Assertion failed: Refresh token was not rotated!');
  }

  console.log('========================================================');
  console.log('✅ SINGLE-FLIGHT REFRESH VERIFICATION PASSED PERFECTLY!');
  console.log('========================================================');
}

runSingleFlightLiveVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
