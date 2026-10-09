import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { HttpStatus } from '../src/constants/http-status.js';

describe('Health Check Endpoint', () => {
  it('GET /health returns 200 OK and connected database status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data.timestamp).toBeDefined();
  });

  it('GET /api/v1/health returns 200 OK via versioned router', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.database).toBe('connected');
  });
});
