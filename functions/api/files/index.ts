import { listDocuments, buildDocumentStoragePath, generateDocumentPresignedUrl } from '../../utils/r2.js';

export async function onRequestGet(context: {
  request: Request;
  env: Record<string, unknown>;
  data: { tenantId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';
  const d1 = context.env.img_d1;

  if (!d1) {
    return new Response(
      JSON.stringify({ success: false, error: 'Database binding (img_d1) not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(context.request.url);
  const directory = url.searchParams.get('dir') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    const files = await listDocuments(d1, tenantId, { directory, search, limit, offset });
    return new Response(
      JSON.stringify({ success: true, tenant_id: tenantId, files }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestPost(context: {
  request: Request;
  env: Record<string, unknown>;
  data: { tenantId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';

  try {
    const body = (await context.request.json()) as {
      file_name?: string;
      directory?: string;
      content_type?: string;
      expires_in?: number;
    };

    if (!body.file_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing file_name' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const storagePath = buildDocumentStoragePath(
      tenantId,
      body.directory || '/',
      body.file_name
    );

    const presigned = await generateDocumentPresignedUrl(
      context.env,
      tenantId,
      storagePath,
      'put',
      { expiresIn: body.expires_in || 3600, contentType: body.content_type }
    );

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        ...presigned,
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
