import { describe, it, expect, beforeEach } from 'vitest';
import { onRequest } from '../functions/webdav/[[path]].js';

class MockWebDavD1 {
  public files: Map<string, any> = new Map();
  public folders: Map<string, any> = new Map();

  prepare(query: string) {
    const self = this;
    let boundArgs: any[] = [];

    return {
      bind(...args: any[]) {
        boundArgs = args;
        return this;
      },
      async run() {
        const q = query.trim();
        if (q.includes('INSERT INTO folders')) {
          const [id, tenant_id, name, parent_path, path] = boundArgs;
          self.folders.set(`${tenant_id}:${path}`, { id, tenant_id, name, parent_path, path });
          return { meta: { changes: 1 } };
        } else if (q.includes('INSERT INTO files')) {
          const [id, tenant_id, value, metadata, file_name, file_type, file_size, upload_ip, list_type, timestamp, directory, tags] = boundArgs;
          self.files.set(`${tenant_id}:${file_name}`, {
            id, tenant_id, value, metadata, file_name, file_type, file_size, directory,
          });
          return { meta: { changes: 1 } };
        } else if (q.includes('DELETE FROM files')) {
          const [id] = boundArgs;
          for (const [k, v] of self.files.entries()) {
            if (v.id === id) {
              self.files.delete(k);
              return { meta: { changes: 1 } };
            }
          }
        }
        return { meta: { changes: 0 } };
      },
      async first() {
        const q = query.trim();
        if (q.includes('SELECT * FROM files WHERE tenant_id = ? AND file_name = ?')) {
          const [tenant_id, file_name] = boundArgs;
          return self.files.get(`${tenant_id}:${file_name}`) || null;
        }
        return null;
      },
      async all() {
        const qNorm = query.replace(/\s+/g, ' ').trim();
        if (qNorm.includes('SELECT id, file_name, file_size, file_type, updated_at FROM files WHERE tenant_id = ?')) {
          const [tenant_id, directory] = boundArgs;
          const results: any[] = [];
          for (const v of self.files.values()) {
            if (v.tenant_id === tenant_id && (directory === '/' || v.directory === directory)) {
              results.push(v);
            }
          }
          return { results };
        }
        return { results: [] };
      },
    };
  }
}

describe('Multi-Tenant WebDAV RFC 4918 Handler', () => {
  const TENANT_A = 'tenant-corp-01';
  const TENANT_B = 'tenant-user-02';
  let mockD1: MockWebDavD1;

  beforeEach(() => {
    mockD1 = new MockWebDavD1();
  });

  it('responds to OPTIONS with RFC 4918 compliance headers', async () => {
    const req = new Request('http://localhost:8080/webdav/', {
      method: 'OPTIONS',
      headers: {
        Authorization: `Basic ${btoa(`${TENANT_A}:secret-key`)}`,
      },
    });

    const res = await onRequest({
      request: req,
      env: { img_d1: mockD1 },
      data: {},
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('DAV')).toContain('1');
    expect(res.headers.get('Allow')).toContain('PROPFIND');
    expect(res.headers.get('Allow')).toContain('MKCOL');
    expect(res.headers.get('Allow')).toContain('PUT');
  });

  it('rejects unauthenticated WebDAV requests with 401', async () => {
    const req = new Request('http://localhost:8080/webdav/', {
      method: 'PROPFIND',
    });

    const res = await onRequest({
      request: req,
      env: { img_d1: mockD1 },
      data: {},
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Basic');
  });

  it('verifies WebDAV password when WEBDAV_PASSWORD or MASTER_API_KEY is configured', async () => {
    const validPass = 'secure-webdav-pass-999';
    // 1. Wrong password -> 401
    const badReq = new Request('http://localhost:8080/webdav/', {
      method: 'OPTIONS',
      headers: {
        Authorization: `Basic ${btoa(`${TENANT_A}:wrong-password`)}`,
      },
    });
    const badRes = await onRequest({
      request: badReq,
      env: { img_d1: mockD1, WEBDAV_PASSWORD: validPass },
      data: {},
    });
    expect(badRes.status).toBe(401);

    // 2. Correct password -> 200
    const goodReq = new Request('http://localhost:8080/webdav/', {
      method: 'OPTIONS',
      headers: {
        Authorization: `Basic ${btoa(`${TENANT_A}:${validPass}`)}`,
      },
    });
    const goodRes = await onRequest({
      request: goodReq,
      env: { img_d1: mockD1, WEBDAV_PASSWORD: validPass },
      data: {},
    });
    expect(goodRes.status).toBe(200);
  });

  it('returns 207 Multi-Status XML for PROPFIND with tenant isolation', async () => {
    // Populate file for Tenant A
    mockD1.files.set(`${TENANT_A}:secret-report.pdf`, {
      id: 'doc-001',
      tenant_id: TENANT_A,
      file_name: 'secret-report.pdf',
      file_size: 1048576,
      file_type: 'application/pdf',
      directory: '/',
      updated_at: new Date().toISOString(),
    });

    // Populate file for Tenant B
    mockD1.files.set(`${TENANT_B}:other-tenant.pdf`, {
      id: 'doc-002',
      tenant_id: TENANT_B,
      file_name: 'other-tenant.pdf',
      file_size: 2048,
      file_type: 'application/pdf',
      directory: '/',
      updated_at: new Date().toISOString(),
    });

    const req = new Request('http://localhost:8080/webdav/', {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${btoa(`${TENANT_A}:pass`)}`,
        Depth: '1',
      },
    });

    const res = await onRequest({
      request: req,
      env: { img_d1: mockD1 },
      data: {},
    });

    expect(res.status).toBe(207);
    expect(res.headers.get('Content-Type')).toContain('xml');

    const xml = await res.text();
    expect(xml).toContain('<D:multistatus');
    expect(xml).toContain('secret-report.pdf');
    // Must NOT leak Tenant B's files
    expect(xml).not.toContain('other-tenant.pdf');
  });

  it('creates directory via MKCOL', async () => {
    const req = new Request('http://localhost:8080/webdav/reports', {
      method: 'MKCOL',
      headers: {
        Authorization: `Basic ${btoa(`${TENANT_A}:pass`)}`,
      },
    });

    const res = await onRequest({
      request: req,
      env: { img_d1: mockD1 },
      data: {},
    });

    expect(res.status).toBe(201);
    expect(mockD1.folders.has(`${TENANT_A}:/reports`)).toBe(true);
  });

  it('handles PUT to create file and DELETE to remove file', async () => {
    const fileBytes = new TextEncoder().encode('Hello WebDAV World');
    const putReq = new Request('http://localhost:8080/webdav/hello.txt', {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${btoa(`${TENANT_A}:pass`)}`,
        'Content-Type': 'text/plain',
      },
      body: fileBytes,
    });

    const putRes = await onRequest({
      request: putReq,
      env: { img_d1: mockD1 },
      data: {},
    });
    expect(putRes.status).toBe(201);
    expect(mockD1.files.has(`${TENANT_A}:hello.txt`)).toBe(true);

    // Now DELETE
    const delReq = new Request('http://localhost:8080/webdav/hello.txt', {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${btoa(`${TENANT_A}:pass`)}`,
      },
    });

    const delRes = await onRequest({
      request: delReq,
      env: { img_d1: mockD1 },
      data: {},
    });
    expect(delRes.status).toBe(204);
    expect(mockD1.files.has(`${TENANT_A}:hello.txt`)).toBe(false);
  });
});
