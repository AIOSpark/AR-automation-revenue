// AIOSpark Pilot Access Revoke API (server-only)
// Platform administrators revoke an active pilot access grant, immediately
// removing the organization's read-only pilot features.
import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantContext } from '@/lib/tenant/middleware';
import { pilotAccessEngine } from '@/lib/billing/pilot-access';
import { authStore } from '@/lib/auth/store';

function requirePlatformAdmin(context: Awaited<ReturnType<typeof resolveTenantContext>>) {
  if (!context) {
    return NextResponse.json({ error: 'Unauthorized session context' }, { status: 401 });
  }
  if (!authStore.isPlatformAdmin(context.user.id)) {
    return NextResponse.json(
      { error: 'Forbidden: Only a platform administrator may revoke pilot access grants.' },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  const adminError = requirePlatformAdmin(await resolveTenantContext(request));
  if (adminError) return adminError;

  try {
    const body = await request.json();
    const { grant_id } = body;
    if (!grant_id) {
      return NextResponse.json({ error: 'grant_id is required' }, { status: 400 });
    }

    const grant = pilotAccessEngine.revokePilotAccess({
      grant_id,
      revoked_by: (await resolveTenantContext(request))!.user.id,
      revoked_by_user_id: (await resolveTenantContext(request))!.user.id,
    });

    if (!grant) {
      return NextResponse.json({ error: 'Pilot access grant not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, grant });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to revoke pilot access' }, { status: 400 });
  }
}
