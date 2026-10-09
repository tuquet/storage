import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { saveProfileRecord, getR2Client } from '../../utils/profiles.js';

export async function onRequestPost(context: {
  request: Request;
  env: Record<string, unknown>;
  data: { tenantId?: string; deviceId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';
  const d1 = context.env.img_d1;

  if (!d1) {
    return new Response(
      JSON.stringify({ success: false, error: 'Database binding (img_d1) not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await context.request.json() as {
      profile_id?: string;
      name?: string;
      storage_path?: string;
      zip_size?: number;
      user_agent?: string;
      browser_version?: string;
      checksum_sha256?: string;
      status?: 'idle' | 'running' | 'syncing';
      metadata?: Record<string, unknown>;
    };

    if (!body.profile_id || !body.storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: profile_id, storage_path' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Security check: Verify storage_path is partitioned under this tenant
    if (!body.storage_path.startsWith(`tenants/${tenantId}/`)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Access denied: Invalid tenant storage path' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let verifiedSize = body.zip_size || 0;

    // Verify object existence & size in R2 if bucket binding is active
    const r2 = context.env.img_r2 as any;
    if (r2 && typeof r2.head === 'function') {
      const obj = await r2.head(body.storage_path);
      if (!obj) {
        return new Response(
          JSON.stringify({ success: false, error: `Object not found in R2 storage at path: ${body.storage_path}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      verifiedSize = obj.size;
    } else if (context.env.R2_ACCESS_KEY_ID && context.env.R2_SECRET_ACCESS_KEY && context.env.NODE_ENV !== 'test') {
      try {
        const s3 = getR2Client(context.env);
        const bucket = (context.env.R2_BUCKET_NAME as string) || 'tuquet-storage';
        const headCmd = new HeadObjectCommand({
          Bucket: bucket,
          Key: body.storage_path,
        });
        const headRes = await s3.send(headCmd);
        if (headRes.ContentLength !== undefined) {
          verifiedSize = headRes.ContentLength;
        }
      } catch (err: any) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          return new Response(
            JSON.stringify({ success: false, error: `Object not found in R2 storage at path: ${body.storage_path}` }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    await saveProfileRecord(d1, tenantId, {
      id: body.profile_id,
      name: body.name || body.profile_id,
      storage_path: body.storage_path,
      zip_size: verifiedSize,
      user_agent: body.user_agent,
      browser_version: body.browser_version,
      checksum_sha256: body.checksum_sha256,
      status: body.status || 'idle',
      metadata: body.metadata,
    });

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        profile_id: body.profile_id,
        storage_path: body.storage_path,
        zip_size: verifiedSize,
        message: 'Profile record verified and saved successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
