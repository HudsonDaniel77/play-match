import { mobileClientConfig } from './src/config';

describe('Mobile Shell Smoke Test', () => {
  it('loads valid mobileClientConfig with default 10.0.2.2 emulator address', () => {
    expect(mobileClientConfig.baseUrl).toBeDefined();
    expect(mobileClientConfig.baseUrl).toContain('10.0.2.2');
    expect(mobileClientConfig.features?.recommendationsMode).toBe('mock');
  });
});
