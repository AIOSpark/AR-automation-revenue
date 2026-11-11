// AIOSpark Usage Limit Check API
// Server-side enforcement: verify usage quota before executing metered operations.

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
    const limitCode = searchParams.get('limitCode') as any;
    const requestedUsage = parseInt(searchParams.get('requestedUsage') || '1', 10);

    if (!limitCode) {
      return NextResponse.json({ success: false, error: 'limitCode is required' }, { status: 400 });
    }

    const check = entitlementEngine.checkUsageLimit(
      context.organization.id,
      limitCode,
      requestedUsage
    );

    return NextResponse.json({
      success: true,
      ...check,
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
    const { limitCode, requestedUsage = 1 } = body;

    if (!limitCode) {
      return NextResponse.json({ success: false, error: 'limitCode is required' }, { status: 400 });
    }

    const enforcement = entitlementEngine.enforceUsageLimit(
      context.organization.id,
      limitCode,
      requestedUsage
    );
    if (enforcement) return enforcement;

    const check = entitlementEngine.checkUsageLimit(
      context.organization.id,
      limitCode,
      requestedUsage
    );

    return NextResponse.json({
      success: true,
      ...check,
      organizationId: context.organization.id,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
