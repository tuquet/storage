import { getProfile, deleteProfile } from '../../../utils/profiles.js';

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

    return new Response(
      JSON.stringify({ success: true, tenant_id: tenantId, profile }),
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
  const profileId = context.params.id;
  const d1 = context.env.img_d1;
  const r2 = context.env.img_r2 as any;

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

    // Delete object from R2 if R2 binding exists
    if (r2 && typeof r2.delete === 'function' && profile.storage_path) {
      try {
        await r2.delete(profile.storage_path);
      } catch (e) {
        console.warn('R2 delete warning:', e);
      }
    }

    // Delete from D1
    await deleteProfile(d1, tenantId, profileId);

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        profile_id: profileId,
        message: 'Profile deleted successfully',
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
