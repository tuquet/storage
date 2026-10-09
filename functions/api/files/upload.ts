import { buildDocumentStoragePath, saveDocumentRecord } from '../../utils/r2.js';

export async function onRequestPost(context: {
  request: Request;
  env: Record<string, unknown>;
  data: { tenantId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';
  const d1 = context.env.img_d1;
  const r2 = context.env.img_r2 as any;

  if (!d1) {
    return new Response(
      JSON.stringify({ success: false, error: 'Database binding (img_d1) not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const contentType = context.request.headers.get('content-type') || '';

  try {
    // 1. Multipart Form Upload (Direct upload for screenshots/documents < 50MB)
    if (contentType.includes('multipart/form-data')) {
      const formData = await context.request.formData();
      const file = formData.get('file') as File | null;
      const directory = (formData.get('dir') as string) || '/';
      const tagsStr = (formData.get('tags') as string) || '';
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

      if (!file) {
        return new Response(
          JSON.stringify({ success: false, error: 'No file uploaded in form data' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const storagePath = buildDocumentStoragePath(tenantId, directory, file.name);

      // Upload to R2 if binding exists
      if (r2 && typeof r2.put === 'function') {
        const arrayBuffer = await file.arrayBuffer();
        await r2.put(storagePath, arrayBuffer, {
          httpMetadata: { contentType: file.type || 'application/octet-stream' },
        });
      }

      // Save record in D1
      await saveDocumentRecord(d1, tenantId, {
        id: fileId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
        directory,
        tags,
      });

      return new Response(
        JSON.stringify({
          success: true,
          tenant_id: tenantId,
          file_id: fileId,
          file_name: file.name,
          storage_path: storagePath,
          size: file.size,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. JSON completion after Presigned S3 Upload
    const body = (await context.request.json()) as {
      file_name?: string;
      storage_path?: string;
      file_size?: number;
      file_type?: string;
      directory?: string;
      tags?: string[];
    };

    if (!body.file_name || !body.storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing file_name or storage_path' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!body.storage_path.startsWith(`tenants/${tenantId}/`)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Access denied: Invalid tenant storage path' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await saveDocumentRecord(d1, tenantId, {
      id: fileId,
      file_name: body.file_name,
      storage_path: body.storage_path,
      file_size: body.file_size || 0,
      file_type: body.file_type || 'application/octet-stream',
      directory: body.directory || '/',
      tags: body.tags || [],
    });

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        file_id: fileId,
        storage_path: body.storage_path,
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
