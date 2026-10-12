import { describe, it, expect } from 'vitest';
import { checkOpenAPIDrift, extractExpressRoutes } from '../src/scripts/check-openapi-drift.js';
import { app } from '../src/app.js';
import fs from 'fs';
import path from 'path';

describe('OpenAPI Specification Drift Check', () => {
  it('has openapi.json file present on disk', () => {
    const specPath = path.resolve(__dirname, '../openapi.json');
    expect(fs.existsSync(specPath)).toBe(true);
  });

  it('contains every Express route in the OpenAPI spec', () => {
    const driftResult = checkOpenAPIDrift();
    expect(driftResult.missingFromSpec).toEqual([]);
  });

  it('is completely synchronized with generator output without drift', () => {
    const driftResult = checkOpenAPIDrift();
    expect(driftResult.driftDetected).toBe(false);
    expect(driftResult.isUpToDate).toBe(true);
  });

  it('documents critical API security schemes and error codes enum', () => {
    const specPath = path.resolve(__dirname, '../openapi.json');
    const content = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

    expect(content.components.securitySchemes.bearerAuth).toBeDefined();
    expect(content.components.securitySchemes.cookieAuth).toBeDefined();
    expect(content.components.schemas.ErrorCodesEnum).toBeDefined();
    expect(content.components.schemas.ErrorCodesEnum.enum.length).toBeGreaterThan(20);
    expect(content.paths['/api/v1/auth/login']).toBeDefined();
    expect(content.paths['/api/v1/games/discover']).toBeDefined();
    expect(content.paths['/api/v1/venues']).toBeDefined();
  });

  it('extracts express routes deterministically', () => {
    const routes = extractExpressRoutes(app);
    expect(routes.length).toBeGreaterThan(20);
    const hasLogin = routes.some((r) => r.method === 'POST' && r.path === '/api/v1/auth/login');
    const hasDiscover = routes.some((r) => r.method === 'GET' && r.path === '/api/v1/games/discover');
    expect(hasLogin).toBe(true);
    expect(hasDiscover).toBe(true);
  });
});
