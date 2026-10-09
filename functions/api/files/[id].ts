import { deleteDocument, generateDocumentPresignedUrl } from '../../utils/r2.js';

export async function onRequestGet(context: {
  request: Request;
  env: Record<string, unknown>;
  params: { id: string };
  data: { tenantId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';
  const fileId = context.params.id;
  const d1 = context.env.img_d1;

  if (!d1) {
    return new Response(
      JSON.stringify({ success: false, error: 'Database binding (img_d1) not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const stmt = d1.prepare('SELECT * FROM files WHERE id = ? AND tenant_id = ?');
    const file = await stmt.bind(fileId, tenantId).first();

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate download URL if requested
    const url = new URL(context.request.url);
    if (url.searchParams.get('download') === 'true' && file.value) {
      const presigned = await generateDocumentPresignedUrl(
        context.env,
        tenantId,
        file.value,
        'get'
      );
      return new Response(
        JSON.stringify({ success: true, tenant_id: tenantId, file, download_url: presigned.url }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, tenant_id: tenantId, file }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestDelete(context: {
  request: Request;
  env: Record<string, unknown>;
  params: { id: string };
  data: { tenantId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';
  const fileId = context.params.id;
  const d1 = context.env.img_d1;
  const r2 = context.env.img_r2;

  if (!d1) {
    return new Response(
      JSON.stringify({ success: false, error: 'Database binding (img_d1) not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const deleted = await deleteDocument(d1, r2, tenantId, fileId);
    if (!deleted) {
      return new Response(
        JSON.stringify({ success: false, error: 'File not found or already deleted' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, tenant_id: tenantId, file_id: fileId, message: 'Deleted' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
