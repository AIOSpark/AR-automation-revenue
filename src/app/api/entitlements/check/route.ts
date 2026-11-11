// AIOSpark Entitlement Check API
// Server-side enforcement: verify feature access before granting protected operations.

import { NextResponse } from 'next/server';
import { entitlementEngine } from '@/lib/billing/entitlements';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const featureCode = searchParams.get('feature');

    if (!featureCode) {
      // Return full entitlement bundle
      const entitlements = entitlementEngine.getOrganizationEntitlements(context.organization.id);
      return NextResponse.json({ success: true, entitlements });
    }

    const hasAccess = entitlementEngine.hasFeatureAccess(context.organization.id, featureCode as any);
    return NextResponse.json({
      success: true,
      feature: featureCode,
      access: hasAccess,
      organizationId: context.organization.id,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    const body = await request.json();
    const { featureCode } = body;

    if (!featureCode) {
      return NextResponse.json({ success: false, error: 'featureCode is required' }, { status: 400 });
    }

    const enforcement = entitlementEngine.enforceFeatureAccess(
      context.organization.id,
      featureCode as any
    );
    if (enforcement) return enforcement;

    return NextResponse.json({
      success: true,
      feature: featureCode,
      access: true,
      organizationId: context.organization.id,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
