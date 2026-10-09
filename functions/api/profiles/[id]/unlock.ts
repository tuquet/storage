import { releaseProfileLock } from '../../../utils/profiles.js';

export async function onRequestPost(context: {
  request: Request;
  env: Record<string, unknown>;
  params: { id: string };
  data: { tenantId?: string; deviceId?: string };
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
    const body = (await context.request.json().catch(() => ({}))) as {
      device_id?: string;
    };

    const deviceId = body.device_id || context.data.deviceId || 'unknown-device';
    const result = await releaseProfileLock(d1, tenantId, profileId, deviceId);

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        profile_id: profileId,
        message: 'Profile lease lock released',
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
