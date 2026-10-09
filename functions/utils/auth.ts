/**
 * Tuquet Storage Hub - Multi-Tenant Authentication Utility
 * Validates Supabase JWT and Device Tokens at the Edge using standard Web Crypto API.
 */

export interface TokenPayload {
  sub?: string;
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  tenant_id?: string;
  app_metadata?: {
    tenants?: Array<{
      tenant_id: string;
      roles?: string[];
    }>;
    [key: string]: unknown;
  };
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthResult {
  valid: boolean;
  tenantId?: string;
  userId?: string;
  roles?: string[];
  isDevice?: boolean;
  deviceId?: string;
  error?: string;
}

/**
 * Decode Base64Url string to string using Web APIs
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Base64Url encode ArrayBuffer
 */
export function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Parse JWT without signature verification
 */
export function parseJwtPayload(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const jsonStr = base64UrlDecode(parts[1]);
    return JSON.parse(jsonStr) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verify HMAC-SHA256 signature of a JWT using Web Crypto API
 */
export async function verifyJwtSignature(
  token: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature
    const signatureStr = atob(
      signatureB64.replace(/-/g, '+').replace(/_/g, '/')
    );
    const signatureBytes = new Uint8Array(signatureStr.length);
    for (let i = 0; i < signatureStr.length; i++) {
      signatureBytes[i] = signatureStr.charCodeAt(i);
    }

    return await crypto.subtle.verify('HMAC', key, signatureBytes, data);
  } catch {
    return false;
  }
}

/**
 * Generate a signed JWT for testing and token issuance
 */
export async function createMockJwt(
  payload: TokenPayload,
  secret: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const signatureB64 = base64UrlEncode(signatureBuffer);

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Main authenticator: checks JWT, API Key or Device Token and resolves tenant context.
 * Implements fail-closed security: unverified tokens are strictly rejected unless explicit dev bypass.
 */
export async function authenticateRequest(
  request: Request,
  env: Record<string, unknown> = {}
): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization') || '';
  const xDeviceToken = request.headers.get('X-Device-Token') || '';
  const xTenantId = request.headers.get('X-Tenant-Id') || '';
  const xApiKey = request.headers.get('X-API-Key') || '';

  const jwtSecret = (env.SUPABASE_JWT_SECRET as string) || (env.JWT_SECRET as string) || '';
  const masterKey = (env.MASTER_API_KEY as string) || '';
  const deviceSecret = (env.DEVICE_TOKEN_SECRET as string) || (env.RUNNER_SECRET as string) || '';

  const isTestOrDev = env.DEV_ALLOW_ANONYMOUS === 'true' ||
    env.NODE_ENV === 'test' ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test');

  // 1. Master API Key / Service Key Check
  if (xApiKey && masterKey && xApiKey === masterKey) {
    return {
      valid: true,
      tenantId: xTenantId || 'system',
      userId: 'master-service-account',
      roles: ['admin', 'service_role']
    };
  }

  // 2. Machine / Device Token check (Specter runner / CLI)
  if (xDeviceToken) {
    if (xDeviceToken.length < 16) {
      return { valid: false, error: 'Invalid device token format' };
    }

    if (deviceSecret && xDeviceToken !== deviceSecret) {
      return { valid: false, error: 'Invalid device token credentials' };
    }

    // Fail-closed in production if device secret is not configured
    if (!deviceSecret && !isTestOrDev) {
      return { valid: false, error: 'Device token authentication not configured on server (fail-closed)' };
    }

    const tenantId = xTenantId || 'default';
    return {
      valid: true,
      tenantId,
      isDevice: true,
      deviceId: request.headers.get('X-Device-Id') || 'unknown-device',
      roles: ['runner']
    };
  }

  // 3. Supabase Bearer JWT Token Check
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) {
      return { valid: false, error: 'Missing bearer token' };
    }

    // Fail-closed: Must have JWT secret configured to verify signature
    if (jwtSecret) {
      const isValidSig = await verifyJwtSignature(token, jwtSecret);
      if (!isValidSig) {
        return { valid: false, error: 'Invalid token signature' };
      }
    } else {
      if (env.DEV_ALLOW_UNVERIFIED_JWT !== 'true') {
        return { valid: false, error: 'JWT secret not configured on server (verification required)' };
      }
    }

    const payload = parseJwtPayload(token);
    if (!payload) {
      return { valid: false, error: 'Malformed token payload' };
    }

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token has expired' };
    }

    // Resolve tenant from app_metadata.tenants or payload.tenant_id
    const userTenants = payload.app_metadata?.tenants || [];
    let resolvedTenantId: string | undefined;
    let resolvedRoles: string[] = [];

    if (xTenantId) {
      const matched = userTenants.find(t => t.tenant_id === xTenantId);
      if (userTenants.length > 0 && !matched && payload.role !== 'service_role') {
        return { valid: false, error: `Unauthorized tenant: ${xTenantId}` };
      }
      resolvedTenantId = xTenantId;
      resolvedRoles = matched?.roles || [];
    } else if (userTenants.length > 0) {
      resolvedTenantId = userTenants[0].tenant_id;
      resolvedRoles = userTenants[0].roles || [];
    } else if (payload.tenant_id) {
      resolvedTenantId = payload.tenant_id;
    } else {
      resolvedTenantId = 'default';
    }

    return {
      valid: true,
      tenantId: resolvedTenantId,
      userId: payload.sub,
      roles: resolvedRoles
    };
  }

  // 4. Fallback for test / explicit anonymous dev mode
  if (env.DEV_ALLOW_ANONYMOUS === 'true') {
    return {
      valid: true,
      tenantId: xTenantId || 'default',
      userId: 'dev-anonymous-user',
      roles: ['dev']
    };
  }

  return { valid: false, error: 'Missing or unsupported authorization header' };
}
