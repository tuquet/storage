import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client } from './profiles.js';

export interface DocumentMetadata {
  id: string;
  tenant_id: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  file_type: string;
  directory: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Build canonical R2 storage key partitioned by tenant
 */
export function buildDocumentStoragePath(tenantId: string, directory: string, fileName: string): string {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
  let safeDir = directory.replace(/\\/g, '/').replace(/\.\./g, '').trim();
  if (safeDir.startsWith('/')) safeDir = safeDir.slice(1);
  if (safeDir.endsWith('/')) safeDir = safeDir.slice(0, -1);

  const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const dirPart = safeDir ? `${safeDir}/` : '';
  return `tenants/${safeTenant}/docs/${dirPart}${cleanFileName}`;
}

/**
 * Generate Presigned S3/R2 URL for a document (upload or download)
 */
export async function generateDocumentPresignedUrl(
  env: Record<string, unknown>,
  tenantId: string,
  storagePath: string,
  action: 'put' | 'get' = 'get',
  options: { expiresIn?: number; contentType?: string } = {}
): Promise<{ url: string; storage_path: string; expires_in: number }> {
  // Enforce tenant boundary
  if (!storagePath.startsWith(`tenants/${tenantId}/`)) {
    throw new Error('Access denied: Storage path does not belong to your tenant');
  }

  const s3 = getR2Client(env);
  const bucket = (env.R2_BUCKET_NAME as string) || 'tuquet-storage';
  const expiresIn = options.expiresIn || 3600;

  let command: PutObjectCommand | GetObjectCommand;
  if (action === 'put') {
    command = new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      ContentType: options.contentType || 'application/octet-stream',
    });
  } else {
    command = new GetObjectCommand({
      Bucket: bucket,
      Key: storagePath,
    });
  }

  const url = await getSignedUrl(s3, command, { expiresIn });
  return {
    url,
    storage_path: storagePath,
    expires_in: expiresIn,
  };
}

/**
 * Save document record into D1 files table
 */
export async function saveDocumentRecord(
  d1: any,
  tenantId: string,
  doc: {
    id: string;
    file_name: string;
    storage_path: string;
    file_size: number;
    file_type: string;
    directory?: string;
    tags?: string[];
    upload_ip?: string;
  }
): Promise<void> {
  const metadata = {
    fileName: doc.file_name,
    fileSize: String(doc.file_size),
    fileType: doc.file_type,
    directory: doc.directory || '/',
    tags: doc.tags || [],
    uploadIP: doc.upload_ip || '127.0.0.1',
    storage_path: doc.storage_path,
    tenant_id: tenantId,
  };

  const stmt = d1.prepare(`
    INSERT INTO files (
      id, tenant_id, value, metadata, file_name, file_type, file_size,
      upload_ip, list_type, timestamp, directory, tags, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      file_name = excluded.file_name,
      file_type = excluded.file_type,
      file_size = excluded.file_size,
      directory = excluded.directory,
      tags = excluded.tags,
      metadata = excluded.metadata,
      updated_at = CURRENT_TIMESTAMP
  `);

  await stmt.bind(
    doc.id,
    tenantId,
    doc.storage_path,
    JSON.stringify(metadata),
    doc.file_name,
    doc.file_type,
    String(doc.file_size),
    doc.upload_ip || '127.0.0.1',
    Date.now(),
    doc.directory || '/',
    doc.tags ? doc.tags.join(',') : ''
  ).run();
}

/**
 * List documents for a tenant with optional directory filter
 */
export async function listDocuments(
  d1: any,
  tenantId: string,
  options: { directory?: string; search?: string; limit?: number; offset?: number } = {}
): Promise<any[]> {
  let query = 'SELECT * FROM files WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (options.directory) {
    query += ' AND directory = ?';
    params.push(options.directory);
  }

  if (options.search) {
    query += ' AND file_name LIKE ?';
    params.push(`%${options.search}%`);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(options.limit || 100, options.offset || 0);

  const stmt = d1.prepare(query);
  const result = await stmt.bind(...params).all();
  return result.results || [];
}

/**
 * Delete a document from D1 and R2
 */
export async function deleteDocument(
  d1: any,
  r2: any,
  tenantId: string,
  fileId: string
): Promise<boolean> {
  // First retrieve file to know storage path
  const queryStmt = d1.prepare('SELECT * FROM files WHERE id = ? AND tenant_id = ?');
  const file = await queryStmt.bind(fileId, tenantId).first();
  if (!file) return false;

  // Delete from R2 if binding exists
  if (r2 && typeof r2.delete === 'function' && file.value) {
    try {
      await r2.delete(file.value);
    } catch (e) {
      console.warn('R2 file deletion warning:', e);
    }
  }

  // Delete from D1
  const delStmt = d1.prepare('DELETE FROM files WHERE id = ? AND tenant_id = ?');
  const res = await delStmt.bind(fileId, tenantId).run();
  return (res.meta?.changes || 0) > 0;
}
