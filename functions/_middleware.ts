import { authenticateRequest } from './utils/auth.js';

// Public endpoints that do not require authentication
const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/public/',
  '/api/manage/sysConfig/page',
];

export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown>;
  data: Record<string, unknown>;
  next: () => Promise<Response>;
}): Promise<Response> {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // 1. Static frontend assets and root routes pass through
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/dav/')) {
    return await context.next();
  }

  // 2. Allow CORS preflight OPTIONS requests
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MKCOL',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Device-Token, X-Device-Id, X-API-Key',
      },
    });
  }

  // 3. Allow public API endpoints
  if (PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return await context.next();
  }

  // 4. Authenticate multi-tenant request
  const authResult = await authenticateRequest(context.request, context.env);

  if (!authResult.valid) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message: authResult.error || 'Authentication required',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="Tuquet Storage"',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // 5. Inject authenticated tenant context into context.data
  context.data.tenantId = authResult.tenantId;
  context.data.userId = authResult.userId;
  context.data.roles = authResult.roles;
  context.data.isDevice = authResult.isDevice;
  context.data.deviceId = authResult.deviceId;

  // 6. Proceed to handler and append CORS headers to response
  const response = await context.next();
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('X-Tenant-Id', authResult.tenantId || 'default');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
