import { getProfile, generateProfileDownloadUrl } from '../../../utils/profiles.js';

export async function onRequestGet(context: {
  request: Request;
  env: Record<string, unknown>;
  params: { id: string };
  data: { tenantId?: string };
}): Promise<Response> {
  const tenantId = context.data.tenantId || 'default';
  const profileId = context.params.id;
  const d1 = context.env.img_d1;

  if (!d1) {
    return new Response(
      JSON.stringify({ success: false, error: 'Database binding (img_d1) not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const profile = await getProfile(d1, tenantId, profileId);
    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Profile not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const presigned = await generateProfileDownloadUrl(
      context.env,
      tenantId,
      profile.storage_path
    );

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        profile_id: profileId,
        storage_path: profile.storage_path,
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
