// AIOSpark Pilot Access Grant API (server-only)
// Platform administrators issue controlled, read-only pilot access grants to
// organizations. Grants are independent of Razorpay billing and never activate
// a paid subscription or initiate payments.
import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantContext } from '@/lib/tenant/middleware';
import { pilotAccessEngine, APPROVED_PILOT_FEATURES } from '@/lib/billing/pilot-access';
import { authStore } from '@/lib/auth/store';

function requirePlatformAdmin(context: Awaited<ReturnType<typeof resolveTenantContext>>) {
  if (!context) {
    return NextResponse.json({ error: 'Unauthorized session context' }, { status: 401 });
  }
  if (!authStore.isPlatformAdmin(context.user.id)) {
    return NextResponse.json(
      { error: 'Forbidden: Only a platform administrator may manage pilot access grants.' },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  if (!context) {
    return NextResponse.json({ error: 'Unauthorized session context' }, { status: 401 });
  }
  const access = pilotAccessEngine.checkPilotAccess(context.organization.id);
  return NextResponse.json({
    success: true,
    is_pilot_organization: pilotAccessEngine.isPilotOrganization(context.organization.id),
    ...access,
  });
}

export async function POST(request: NextRequest) {
  const adminError = requirePlatformAdmin(await resolveTenantContext(request));
  if (adminError) return adminError;
  const context = await resolveTenantContext(request);

  try {
    const body = await request.json();
    const {
      organization_id,
      approved_features,
      read_only,
      pilot_charter_reference,
      starts_at,
      expires_at,
    } = body;

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }
    if (!Array.isArray(approved_features) || approved_features.length === 0) {
      return NextResponse.json(
        { error: 'approved_features must be a non-empty array' },
        { status: 400 },
      );
    }
    const invalid = approved_features.filter((f) => !APPROVED_PILOT_FEATURES.has(f));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Non-approved pilot features: ${invalid.join(', ')}` },
        { status: 400 },
      );
    }

    const grant = pilotAccessEngine.grantPilotAccess({
      organization_id,
      granted_by: context!.user.id,
      granted_by_user_id: context!.user.id,
      approved_features,
      read_only: read_only !== false,
      pilot_charter_reference,
      starts_at,
      expires_at,
    });

    return NextResponse.json({ success: true, grant }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to grant pilot access' }, { status: 400 });
  }
}
