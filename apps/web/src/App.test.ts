import { describe, it, expect } from 'vitest';
import { webClientConfig } from '../src/config.js';

describe('Web Shell Smoke Test', () => {
  it('loads valid webClientConfig with default base URL and feature flags', () => {
    expect(webClientConfig.baseUrl).toBeDefined();
    expect(webClientConfig.features?.recommendationsMode).toBe('mock');
    expect(webClientConfig.features?.teamsMode).toBe('mock');
    expect(webClientConfig.features?.resultsMode).toBe('mock');
    expect(webClientConfig.features?.notificationsMode).toBe('mock');
    expect(webClientConfig.features?.reliabilityMode).toBe('mock');
  });
});
