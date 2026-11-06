import { NextRequest, NextResponse } from 'next/server';
import { CashUnblockSimulatorEngine } from '@/lib/intelligence/cash-unblock-simulator';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function POST(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;

  const body = await request.json();
  if (!body.invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  const simulation = CashUnblockSimulatorEngine.simulate({
    invoiceId: body.invoiceId,
    orgId: context!.organization.id,
    selectedActionType: body.selectedActionType,
    userRole: context!.role,
  });

  if (!simulation) return NextResponse.json({ error: 'Simulation unavailable' }, { status: 404 });
  return NextResponse.json({ simulation });
}
