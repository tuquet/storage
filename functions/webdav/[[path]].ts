/**
 * Multi-Tenant WebDAV RFC 4918 Server for Tuquet Storage Hub
 * Automatically isolates root /webdav/ to tenants/{tenant_id}/
 */

import { authenticateRequest, verifyJwtSignature, parseJwtPayload } from '../utils/auth.js';
import { buildDocumentStoragePath, saveDocumentRecord } from '../utils/r2.js';

export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown>;
  data: { tenantId?: string };
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);

  // Normalize root path
  if (url.pathname === '/webdav') {
    url.pathname = '/webdav/';
    return Response.redirect(url.toString(), 301);
  }

  // 1. Resolve Multi-Tenant Context (Basic Auth or JWT)
  let tenantId = context.data.tenantId;

  if (!tenantId) {
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader.startsWith('Basic ')) {
      try {
        const decoded = atob(authHeader.slice(6));
        const colonIdx = decoded.indexOf(':');
        const username = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
        const password = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';

        const masterKey = (env.MASTER_API_KEY as string) || '';
        const webdavPass = (env.WEBDAV_PASSWORD as string) || '';
        const jwtSecret = (env.SUPABASE_JWT_SECRET as string) || (env.JWT_SECRET as string) || '';
        const deviceSecret = (env.DEVICE_TOKEN_SECRET as string) || (env.RUNNER_SECRET as string) || '';

        const isTestOrDev = env.DEV_ALLOW_ANONYMOUS === 'true' ||
          env.NODE_ENV === 'test' ||
          (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test');

        let passwordValid = false;
        if (webdavPass && password === webdavPass) {
          passwordValid = true;
        } else if (masterKey && password === masterKey) {
          passwordValid = true;
        } else if (deviceSecret && password === deviceSecret) {
          passwordValid = true;
        } else if (jwtSecret && password.split('.').length === 3) {
          const validSig = await verifyJwtSignature(password, jwtSecret);
          if (validSig) {
            const payload = parseJwtPayload(password);
            const userTenants = payload?.app_metadata?.tenants || [];
            if (userTenants.some(t => t.tenant_id === username) || payload?.role === 'service_role' || username === 'token') {
              passwordValid = true;
            }
          }
        } else if (!webdavPass && !masterKey && !jwtSecret && !deviceSecret && isTestOrDev) {
          passwordValid = true;
        }

        if (passwordValid && username) {
          tenantId = username === 'token' ? 'default' : username;
        }
      } catch {}
    }

    if (!tenantId) {
      const authResult = await authenticateRequest(request, env);
      if (authResult.valid) {
        tenantId = authResult.tenantId;
      }
    }
  }

  if (!tenantId) {
    return new Response('Authentication required for Tuquet WebDAV', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Tuquet Multi-Tenant WebDAV"',
      },
    });
  }

  // Strip prefix /webdav to get relative resource path
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/webdav/, '') || '/');

  switch (request.method) {
    case 'OPTIONS':
      return new Response(null, {
        status: 200,
        headers: {
          'Allow': 'OPTIONS, GET, PUT, DELETE, PROPFIND, MKCOL, MOVE',
          'DAV': '1, 2',
          'MS-Author-Via': 'DAV',
        },
      });

    case 'PROPFIND':
      return handlePropfind(request, env, tenantId, relativePath);

    case 'GET':
      return handleGet(request, env, tenantId, relativePath);

    case 'PUT':
      return handlePut(request, env, tenantId, relativePath);

    case 'DELETE':
      return handleDelete(request, env, tenantId, relativePath);

    case 'MKCOL':
      return handleMkcol(request, env, tenantId, relativePath);

    default:
      return new Response('Method Not Allowed', { status: 405 });
  }
}

// ==================== WebDAV Handlers ====================

async function handlePropfind(
  request: Request,
  env: Record<string, unknown>,
  tenantId: string,
  relativePath: string
): Promise<Response> {
  const d1 = env.img_d1 as any;
  const isDir = relativePath.endsWith('/') || relativePath === '';
  let targetDir = '/';
  if (relativePath && relativePath !== '/') {
    targetDir = '/' + relativePath.replace(/^\/+/, '').replace(/\/+$/, '');
  }
  const displayName = targetDir === '/' ? 'root' : targetDir.split('/').pop() || 'root';

  let xmlResponses = '';

  // 1. Current collection/file element
  const currentHref = `/webdav${relativePath.startsWith('/') ? relativePath : '/' + relativePath}`;
  xmlResponses += `
    <D:response>
      <D:href>${escapeXml(currentHref)}</D:href>
      <D:propstat>
        <D:prop>
          <D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>
          <D:displayname>${escapeXml(displayName)}</D:displayname>
          <D:getlastmodified>${new Date().toUTCString()}</D:getlastmodified>
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>`;

  // 2. If directory and Depth != 0, query child files from D1
  const depth = request.headers.get('Depth') || '1';
  if (isDir && depth !== '0' && d1) {
    try {
      const stmt = d1.prepare(`
        SELECT id, file_name, file_size, file_type, updated_at
        FROM files
        WHERE tenant_id = ? AND directory = ?
        ORDER BY file_name ASC
      `);
      const childFiles = (await stmt.bind(tenantId, targetDir).all())?.results || [];

      for (const file of childFiles) {
        const fileHref = `${currentHref.endsWith('/') ? currentHref : currentHref + '/'}${encodeURIComponent(file.file_name)}`;
        xmlResponses += `
          <D:response>
            <D:href>${escapeXml(fileHref)}</D:href>
            <D:propstat>
              <D:prop>
                <D:resourcetype/>
                <D:displayname>${escapeXml(file.file_name)}</D:displayname>
                <D:getcontentlength>${file.file_size || 0}</D:getcontentlength>
                <D:getcontenttype>${escapeXml(file.file_type || 'application/octet-stream')}</D:getcontenttype>
                <D:getlastmodified>${file.updated_at ? new Date(file.updated_at).toUTCString() : new Date().toUTCString()}</D:getlastmodified>
              </D:prop>
              <D:status>HTTP/1.1 200 OK</D:status>
            </D:propstat>
          </D:response>`;
      }
    } catch (e) {
      console.warn('WebDAV D1 query warning:', e);
    }
  }

  const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
${xmlResponses}
</D:multistatus>`;

  return new Response(xml, {
    status: 207,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'DAV': '1, 2',
    },
  });
}

async function handleGet(
  request: Request,
  env: Record<string, unknown>,
  tenantId: string,
  relativePath: string
): Promise<Response> {
  const r2 = env.img_r2 as any;
  const d1 = env.img_d1 as any;

  if (relativePath.endsWith('/') || relativePath === '') {
    return new Response('Directory listing available via PROPFIND', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const fileName = relativePath.split('/').pop() || '';
  const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/')) || '/';

  // Check D1 record
  if (d1) {
    const stmt = d1.prepare('SELECT * FROM files WHERE tenant_id = ? AND file_name = ? AND directory = ?');
    const file = await stmt.bind(tenantId, fileName, dirPath).first();
    if (file && r2 && typeof r2.get === 'function') {
      const obj = await r2.get(file.value);
      if (obj) {
        return new Response(obj.body, {
          headers: {
            'Content-Type': file.file_type || 'application/octet-stream',
            'Content-Length': String(file.file_size || 0),
          },
        });
      }
    }
  }

  return new Response('File Not Found', { status: 404 });
}

async function handlePut(
  request: Request,
  env: Record<string, unknown>,
  tenantId: string,
  relativePath: string
): Promise<Response> {
  const r2 = env.img_r2 as any;
  const d1 = env.img_d1 as any;

  if (!relativePath || relativePath.endsWith('/')) {
    return new Response('Cannot PUT to collection', { status: 400 });
  }

  const fileName = relativePath.split('/').pop() || 'unnamed-file';
  const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/')) || '/';
  const storagePath = buildDocumentStoragePath(tenantId, dirPath, fileName);

  const arrayBuffer = await request.arrayBuffer();
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

  if (r2 && typeof r2.put === 'function') {
    await r2.put(storagePath, arrayBuffer, {
      httpMetadata: { contentType },
    });
  }

  if (d1) {
    const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await saveDocumentRecord(d1, tenantId, {
      id: fileId,
      file_name: fileName,
      storage_path: storagePath,
      file_size: arrayBuffer.byteLength,
      file_type: contentType,
      directory: dirPath,
    });
  }

  return new Response(null, { status: 201 });
}

async function handleDelete(
  request: Request,
  env: Record<string, unknown>,
  tenantId: string,
  relativePath: string
): Promise<Response> {
  const r2 = env.img_r2 as any;
  const d1 = env.img_d1 as any;

  const fileName = relativePath.split('/').pop() || '';
  const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/')) || '/';

  if (d1) {
    const stmt = d1.prepare('SELECT * FROM files WHERE tenant_id = ? AND file_name = ? AND directory = ?');
    const file = await stmt.bind(tenantId, fileName, dirPath).first();
    if (file) {
      if (r2 && typeof r2.delete === 'function' && file.value) {
        await r2.delete(file.value);
      }
      await d1.prepare('DELETE FROM files WHERE id = ?').bind(file.id).run();
    }
  }

  return new Response(null, { status: 204 });
}

async function handleMkcol(
  request: Request,
  env: Record<string, unknown>,
  tenantId: string,
  relativePath: string
): Promise<Response> {
  const d1 = env.img_d1 as any;
  const dirName = relativePath.split('/').filter(Boolean).pop() || '';
  const parentPath = relativePath.substring(0, relativePath.lastIndexOf('/')) || '/';

  if (d1) {
    const folderId = `folder-${Date.now()}`;
    await d1.prepare(`
      INSERT INTO folders (id, tenant_id, name, parent_path, path)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, path) DO NOTHING
    `).bind(folderId, tenantId, dirName, parentPath, relativePath).run();
  }

  return new Response(null, { status: 201 });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
