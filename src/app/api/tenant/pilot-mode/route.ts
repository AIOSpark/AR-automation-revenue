// AIOSpark Pilot Mode API (server-only)
// Platform administrators place an organization into read-only pilot mode, which
// blocks financial mutations via the existing validatePilotReadOnly gate while
// leaving read-only access (including pilot access grants) intact.
import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantContext } from '@/lib/tenant/middleware';
import { setPilotMode, isPilotOrganization } from '@/lib/auth/pilot';
import { authStore } from '@/lib/auth/store';

function requirePlatformAdmin(context: Awaited<ReturnType<typeof resolveTenantContext>>) {
  if (!context) {
    return NextResponse.json({ error: 'Unauthorized session context' }, { status: 401 });
  }
  if (!authStore.isPlatformAdmin(context.user.id)) {
    return NextResponse.json(
      { error: 'Forbidden: Only a platform administrator may manage pilot mode.' },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  const adminError = requirePlatformAdmin(await resolveTenantContext(request));
  if (adminError) return adminError;
  const context = await resolveTenantContext(request);

  try {
    const body = await request.json();
    const { organization_id, enabled } = body;

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
    }

    const org = authStore.getOrganizationById(organization_id);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    setPilotMode(organization_id, enabled);

    return NextResponse.json({
      success: true,
      organization_id,
      pilot_mode: isPilotOrganization(organization_id),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to set pilot mode' }, { status: 400 });
  }
}
