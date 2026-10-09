import { acquireProfileLock } from '../../../utils/profiles.js';

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
      duration_seconds?: number;
    };

    const deviceId = body.device_id || context.data.deviceId || 'unknown-device';
    const duration = body.duration_seconds || 300;

    const result = await acquireProfileLock(d1, tenantId, profileId, deviceId, duration);

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        profile_id: profileId,
        locked_by_device_id: deviceId,
        locked_duration_seconds: duration,
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
