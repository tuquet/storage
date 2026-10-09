import { describe, it, expect } from 'vitest';
import {
  authenticateRequest,
  createMockJwt,
  parseJwtPayload,
  verifyJwtSignature,
  TokenPayload,
} from '../functions/utils/auth.js';
import { onRequest } from '../functions/_middleware.js';

describe('Multi-Tenant Edge Authentication', () => {
  const TEST_SECRET = 'super-secret-jwt-key-for-tuquet-cloud-testing-12345';
  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';
  const USER_ID = 'user-uuid-9999-8888';

  it('correctly parses and signs JWT tokens with Web Crypto API', async () => {
    const payload: TokenPayload = {
      sub: USER_ID,
      role: 'authenticated',
      app_metadata: {
        tenants: [
          { tenant_id: TENANT_A, roles: ['admin'] },
          { tenant_id: TENANT_B, roles: ['member'] },
        ],
      },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = await createMockJwt(payload, TEST_SECRET);
    expect(token).toBeDefined();

    const parsed = parseJwtPayload(token);
    expect(parsed?.sub).toBe(USER_ID);
    expect(parsed?.app_metadata?.tenants?.length).toBe(2);

    const isValid = await verifyJwtSignature(token, TEST_SECRET);
    expect(isValid).toBe(true);

    const isWrongSig = await verifyJwtSignature(token, 'wrong-secret');
    expect(isWrongSig).toBe(false);
  });

  it('rejects requests without any auth headers', async () => {
    const req = new Request('http://localhost:8080/api/files', {
      method: 'GET',
    });
    const result = await authenticateRequest(req, { SUPABASE_JWT_SECRET: TEST_SECRET });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('authenticates valid Supabase JWT and extracts primary tenant', async () => {
    const payload: TokenPayload = {
      sub: USER_ID,
      role: 'authenticated',
      app_metadata: {
        tenants: [{ tenant_id: TENANT_A, roles: ['owner'] }],
      },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await createMockJwt(payload, TEST_SECRET);

    const req = new Request('http://localhost:8080/api/files', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await authenticateRequest(req, { SUPABASE_JWT_SECRET: TEST_SECRET });
    expect(result.valid).toBe(true);
    expect(result.tenantId).toBe(TENANT_A);
    expect(result.userId).toBe(USER_ID);
    expect(result.roles).toEqual(['owner']);
  });

  it('allows tenant switching via X-Tenant-Id header if user has access', async () => {
    const payload: TokenPayload = {
      sub: USER_ID,
      role: 'authenticated',
      app_metadata: {
        tenants: [
          { tenant_id: TENANT_A, roles: ['member'] },
          { tenant_id: TENANT_B, roles: ['admin'] },
        ],
      },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await createMockJwt(payload, TEST_SECRET);

    const req = new Request('http://localhost:8080/api/files', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': TENANT_B,
      },
    });

    const result = await authenticateRequest(req, { SUPABASE_JWT_SECRET: TEST_SECRET });
    expect(result.valid).toBe(true);
    expect(result.tenantId).toBe(TENANT_B);
    expect(result.roles).toEqual(['admin']);
  });

  it('rejects X-Tenant-Id if tenant is not in user token claims', async () => {
    const payload: TokenPayload = {
      sub: USER_ID,
      role: 'authenticated',
      app_metadata: {
        tenants: [{ tenant_id: TENANT_A, roles: ['member'] }],
      },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await createMockJwt(payload, TEST_SECRET);

    const req = new Request('http://localhost:8080/api/files', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': 'unauthorized-tenant-999',
      },
    });

    const result = await authenticateRequest(req, { SUPABASE_JWT_SECRET: TEST_SECRET });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unauthorized tenant');
  });

  it('rejects expired JWT tokens', async () => {
    const payload: TokenPayload = {
      sub: USER_ID,
      role: 'authenticated',
      app_metadata: {
        tenants: [{ tenant_id: TENANT_A }],
      },
      exp: Math.floor(Date.now() / 1000) - 100, // expired in past
    };
    const token = await createMockJwt(payload, TEST_SECRET);

    const req = new Request('http://localhost:8080/api/files', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await authenticateRequest(req, { SUPABASE_JWT_SECRET: TEST_SECRET });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('authenticates valid device machine token for CLI runners', async () => {
    const req = new Request('http://localhost:8080/api/profiles/upload-url', {
      method: 'POST',
      headers: {
        'X-Device-Token': 'specter-runner-device-token-1234567890',
        'X-Tenant-Id': TENANT_A,
        'X-Device-Id': 'win-workstation-01',
      },
    });

    const result = await authenticateRequest(req, {});
    expect(result.valid).toBe(true);
    expect(result.isDevice).toBe(true);
    expect(result.tenantId).toBe(TENANT_A);
    expect(result.deviceId).toBe('win-workstation-01');
  });

  it('fails closed when SUPABASE_JWT_SECRET is missing in production', async () => {
    const payload: TokenPayload = {
      sub: USER_ID,
      role: 'authenticated',
      app_metadata: { tenants: [{ tenant_id: TENANT_A }] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await createMockJwt(payload, TEST_SECRET);
    const req = new Request('http://localhost:8080/api/files', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await authenticateRequest(req, { NODE_ENV: 'production' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JWT secret not configured');
  });

  it('validates device token credentials against DEVICE_TOKEN_SECRET', async () => {
    const validSecret = 'valid-runner-secret-key-123456';
    const req = new Request('http://localhost:8080/api/profiles/upload-url', {
      method: 'POST',
      headers: {
        'X-Device-Token': validSecret,
        'X-Tenant-Id': TENANT_A,
        'X-Device-Id': 'win-workstation-01',
      },
    });

    // 1. Matching secret -> valid
    const okResult = await authenticateRequest(req, { DEVICE_TOKEN_SECRET: validSecret });
    expect(okResult.valid).toBe(true);

    // 2. Mismatched secret -> rejected
    const badResult = await authenticateRequest(req, { DEVICE_TOKEN_SECRET: 'different-secret-777777' });
    expect(badResult.valid).toBe(false);
    expect(badResult.error).toContain('Invalid device token credentials');
  });

  it('verifies _middleware.ts blocks unauthorized API and allows authorized', async () => {
    // 1. Unauthenticated request to /api/manage -> should return 401
    const unauthReq = new Request('http://localhost:8080/api/manage/files', {
      method: 'GET',
    });
    const ctx1 = {
      request: unauthReq,
      env: { SUPABASE_JWT_SECRET: TEST_SECRET },
      data: {} as Record<string, unknown>,
      next: async () => new Response(JSON.stringify({ ok: true })),
    };
    const res1 = await onRequest(ctx1);
    expect(res1.status).toBe(401);

    // 2. Static asset request -> should pass through
    const staticReq = new Request('http://localhost:8080/index.html', {
      method: 'GET',
    });
    let passedStatic = false;
    const ctx2 = {
      request: staticReq,
      env: {},
      data: {} as Record<string, unknown>,
      next: async () => {
        passedStatic = true;
        return new Response('<html></html>');
      },
    };
    const res2 = await onRequest(ctx2);
    expect(res2.status).toBe(200);
    expect(passedStatic).toBe(true);

    // 3. Authenticated request -> should pass through and set context.data.tenantId
    const payload: TokenPayload = {
      sub: USER_ID,
      role: 'authenticated',
      app_metadata: {
        tenants: [{ tenant_id: TENANT_A }],
      },
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await createMockJwt(payload, TEST_SECRET);
    const authReq = new Request('http://localhost:8080/api/manage/files', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    let passedAuth = false;
    const ctx3 = {
      request: authReq,
      env: { SUPABASE_JWT_SECRET: TEST_SECRET },
      data: {} as Record<string, unknown>,
      next: async () => {
        passedAuth = true;
        return new Response(JSON.stringify({ files: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    };
    const res3 = await onRequest(ctx3);
    expect(res3.status).toBe(200);
    expect(passedAuth).toBe(true);
    expect(ctx3.data.tenantId).toBe(TENANT_A);
    expect(res3.headers.get('X-Tenant-Id')).toBe(TENANT_A);
  });
});
