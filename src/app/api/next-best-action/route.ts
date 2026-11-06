import { NextRequest, NextResponse } from 'next/server';
import { NextBestActionEngine } from '@/lib/intelligence/next-best-action-engine';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { withApiMetric } from '@/lib/observability/api-metrics';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(request: NextRequest) {
  return withApiMetric('/api/next-best-action', async () => {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get('invoiceId');
  const userRole = context!.role;
  const orgId = context!.organization.id;

  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId parameter is required' }, { status: 400 });
  }

  const rec = NextBestActionEngine.evaluateCase(invoiceId, orgId, userRole);
  if (!rec) {
    return NextResponse.json({ error: 'Invoice not found or cannot evaluate recommendation' }, { status: 444 });
  }

  return NextResponse.json({ recommendation: rec });
  });
}

export async function POST(request: NextRequest) {
  return withApiMetric('/api/next-best-action', async () => {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'edit', 'invoices');
    if (permissionError) return permissionError;
    const body = await request.json();
    const { action, invoiceId, feedbackType, reason, expectedStateTimestamp } = body;
    const orgId = context!.organization.id;

    // Read-only pilot mode: recording feedback is an internal workflow record.
    const pilotError = validatePilotReadOnly(orgId, 'CUSTOMER_RECORD_MUTATION');
    if (pilotError) return pilotError;

    if (action === 'VERIFY_FRESHNESS') {
      const result = NextBestActionEngine.verifyFreshnessAndState(invoiceId, orgId, expectedStateTimestamp);
      return NextResponse.json(result);
    }

    if (action === 'RECORD_FEEDBACK') {
      const fb = NextBestActionEngine.recordFeedback({
        recommendationId: body.recommendationId || invoiceId,
        invoiceId,
        userRole: context!.role,
        organizationId: orgId,
        actorUserId: context!.user.id,
        feedbackType: feedbackType || 'ACCEPT',
        reason,
      });
      return NextResponse.json({ success: true, feedback: fb });
    }

    return NextResponse.json({ error: 'Unknown action specified' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
  });
}
