import { generateProfileUploadUrl } from '../../utils/profiles.js';

export async function onRequestPost(context: {
  request: Request;
  env: Record<string, unknown>;
  data: { tenantId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';

  try {
    const body = await context.request.json().catch(() => ({})) as {
      profile_id?: string;
      name?: string;
      zip_size?: number;
      format?: string;
      expires_in?: number;
    };

    if (!body.profile_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: profile_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const presigned = await generateProfileUploadUrl(
      context.env,
      tenantId,
      body.profile_id,
      {
        expiresIn: body.expires_in || 3600,
        format: body.format || 'tar.zst',
      }
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
