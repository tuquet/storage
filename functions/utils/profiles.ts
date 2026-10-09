import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client } from './storage/s3Client.js';

export interface BrowserProfileRecord {
  id: string;
  tenant_id: string;
  name: string;
  storage_path: string;
  zip_size: number;
  user_agent?: string;
  browser_version?: string;
  locked_by_device_id?: string | null;
  locked_until?: number | null;
  status: 'idle' | 'running' | 'syncing';
  checksum_sha256?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface PresignedUrlResult {
  upload_url: string;
  storage_path: string;
  profile_id: string;
  expires_in: number;
}

/**
 * Build canonical storage path for a profile archive (.tar.zst or .zip)
 */
export function buildProfileStoragePath(
  tenantId: string,
  profileId: string,
  timestamp?: number,
  format: string = 'tar.zst'
): string {
  const ts = timestamp || Date.now();
  // Sanitize path components to prevent path traversal
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeProfile = profileId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanExt = format.replace(/^\./, '').replace(/[^a-zA-Z0-9.]/g, '') || 'tar.zst';
  return `tenants/${safeTenant}/profiles/${safeProfile}/${ts}.${cleanExt}`;
}

/**
 * Configure S3 Client for Cloudflare R2
 */
export function getR2Client(env: Record<string, unknown>) {
  const accountId = (env.R2_ACCOUNT_ID as string) || '';
  const accessKeyId = (env.R2_ACCESS_KEY_ID as string) || 'mock-access-key';
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY as string) || 'mock-secret-key';
  const endpoint = (env.R2_ENDPOINT as string) || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : 'https://00000000000000000000000000000000.r2.cloudflarestorage.com');
  const region = (env.R2_REGION as string) || 'auto';

  return createS3Client({
    endpoint,
    accessKeyId,
    secretAccessKey,
    region,
    pathStyle: true,
  });
}

/**
 * Generate Presigned Upload URL for a browser profile archive (.tar.zst or .zip)
 */
export async function generateProfileUploadUrl(
  env: Record<string, unknown>,
  tenantId: string,
  profileId: string,
  options: { expiresIn?: number; contentType?: string; format?: string } = {}
): Promise<PresignedUrlResult> {
  const expiresIn = options.expiresIn || 3600;
  const format = options.format || 'tar.zst';
  const storagePath = buildProfileStoragePath(tenantId, profileId, undefined, format);
  const bucket = (env.R2_BUCKET_NAME as string) || 'tuquet-storage';

  let defaultContentType = 'application/octet-stream';
  if (format === 'zip') {
    defaultContentType = 'application/zip';
  } else if (format === 'tar.zst' || format.endsWith('.zst')) {
    defaultContentType = 'application/zstd';
  }

  const s3 = getR2Client(env);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storagePath,
    ContentType: options.contentType || defaultContentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn });

  return {
    upload_url: uploadUrl,
    storage_path: storagePath,
    profile_id: profileId,
    expires_in: expiresIn,
  };
}

/**
 * Generate Presigned Download URL for browser profile zip
 */
export async function generateProfileDownloadUrl(
  env: Record<string, unknown>,
  tenantId: string,
  storagePath: string,
  options: { expiresIn?: number } = {}
): Promise<{ download_url: string; expires_in: number }> {
  // Ensure the storage path strictly belongs to the requested tenant
  if (!storagePath.startsWith(`tenants/${tenantId}/`)) {
    throw new Error('Access denied: Storage path does not belong to your tenant');
  }

  const expiresIn = options.expiresIn || 3600;
  const bucket = (env.R2_BUCKET_NAME as string) || 'tuquet-storage';

  const s3 = getR2Client(env);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storagePath,
  });

  const downloadUrl = await getSignedUrl(s3, command, { expiresIn });

  return {
    download_url: downloadUrl,
    expires_in: expiresIn,
  };
}

// ==================== D1 Database Operations ====================

/**
 * Save or update a browser profile metadata record in D1
 */
export async function saveProfileRecord(
  d1: any,
  tenantId: string,
  profile: Partial<BrowserProfileRecord> & { id: string; storage_path: string }
): Promise<void> {
  const stmt = d1.prepare(`
    INSERT INTO browser_profiles (
      id, tenant_id, name, storage_path, zip_size, user_agent, browser_version,
      status, checksum_sha256, metadata, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = coalesce(excluded.name, browser_profiles.name),
      storage_path = excluded.storage_path,
      zip_size = coalesce(excluded.zip_size, browser_profiles.zip_size),
      user_agent = coalesce(excluded.user_agent, browser_profiles.user_agent),
      browser_version = coalesce(excluded.browser_version, browser_profiles.browser_version),
      status = coalesce(excluded.status, browser_profiles.status),
      checksum_sha256 = coalesce(excluded.checksum_sha256, browser_profiles.checksum_sha256),
      metadata = coalesce(excluded.metadata, browser_profiles.metadata),
      updated_at = CURRENT_TIMESTAMP
  `);

  await stmt.bind(
    profile.id,
    tenantId,
    profile.name || profile.id,
    profile.storage_path,
    profile.zip_size || 0,
    profile.user_agent || null,
    profile.browser_version || null,
    profile.status || 'idle',
    profile.checksum_sha256 || null,
    profile.metadata ? JSON.stringify(profile.metadata) : null
  ).run();
}

/**
 * List all browser profiles for a tenant
 */
export async function listProfiles(
  d1: any,
  tenantId: string
): Promise<BrowserProfileRecord[]> {
  const stmt = d1.prepare(`
    SELECT * FROM browser_profiles
    WHERE tenant_id = ?
    ORDER BY updated_at DESC
  `);
  const result = await stmt.bind(tenantId).all();
  return (result.results || []) as BrowserProfileRecord[];
}

/**
 * Get single browser profile by ID within tenant
 */
export async function getProfile(
  d1: any,
  tenantId: string,
  profileId: string
): Promise<BrowserProfileRecord | null> {
  const stmt = d1.prepare(`
    SELECT * FROM browser_profiles
    WHERE tenant_id = ? AND id = ?
  `);
  const row = await stmt.bind(tenantId, profileId).first();
  return (row as BrowserProfileRecord) || null;
}

/**
 * Delete browser profile from D1
 */
export async function deleteProfile(
  d1: any,
  tenantId: string,
  profileId: string
): Promise<boolean> {
  const stmt = d1.prepare(`
    DELETE FROM browser_profiles
    WHERE tenant_id = ? AND id = ?
  `);
  const result = await stmt.bind(tenantId, profileId).run();
  return (result.meta?.changes || 0) > 0;
}

/**
 * Acquire lease lock on a profile for a device atomically via conditional SQL
 */
export async function acquireProfileLock(
  d1: any,
  tenantId: string,
  profileId: string,
  deviceId: string,
  leaseSeconds: number = 300
): Promise<{ success: boolean; error?: string }> {
  const now = Math.floor(Date.now() / 1000);
  const lockExpires = now + leaseSeconds;

  // Atomic conditional SQL UPDATE to prevent TOCTOU race conditions
  const stmt = d1.prepare(`
    UPDATE browser_profiles
    SET locked_by_device_id = ?,
        locked_until = ?,
        status = 'running',
        updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ?
      AND id = ?
      AND (
        locked_by_device_id IS NULL
        OR locked_by_device_id = ?
        OR locked_until < ?
      )
  `);

  const result = await stmt.bind(deviceId, lockExpires, tenantId, profileId, deviceId, now).run();

  if ((result.meta?.changes || 0) > 0) {
    return { success: true };
  }

  // If 0 changes, check if profile exists or is locked by another device
  const current = await getProfile(d1, tenantId, profileId);
  if (!current) {
    return { success: false, error: 'Profile not found' };
  }

  return {
    success: false,
    error: `Profile is currently locked by device '${current.locked_by_device_id}' until ${new Date((current.locked_until || 0) * 1000).toISOString()}`,
  };
}

/**
 * Release lease lock on a profile atomically via conditional SQL
 */
export async function releaseProfileLock(
  d1: any,
  tenantId: string,
  profileId: string,
  deviceId: string
): Promise<{ success: boolean; error?: string }> {
  // Atomic conditional SQL UPDATE: only clears if held by this device or already null
  const stmt = d1.prepare(`
    UPDATE browser_profiles
    SET locked_by_device_id = NULL,
        locked_until = NULL,
        status = 'idle',
        updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ?
      AND id = ?
      AND (locked_by_device_id = ? OR locked_by_device_id IS NULL)
  `);

  const result = await stmt.bind(tenantId, profileId, deviceId).run();

  if ((result.meta?.changes || 0) > 0) {
    return { success: true };
  }

  const current = await getProfile(d1, tenantId, profileId);
  if (!current) {
    return { success: false, error: 'Profile not found' };
  }

  if (current.locked_by_device_id && current.locked_by_device_id !== deviceId) {
    return { success: false, error: 'Lock owned by different device' };
  }

  return { success: true };
}
