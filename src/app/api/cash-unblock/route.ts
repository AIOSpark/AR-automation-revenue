import { NextResponse } from 'next/server';
import { getCashUnblockQueue, getUnblockQueueSummary } from '@/lib/unblock-queue/engine';
import { AuditService } from '@/lib/audit/service';
import { auditStore } from '@/lib/audit/store';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'view', 'cash_unblock');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(request.url);
    const orgId = context!.organization.id;
    const queue = getCashUnblockQueue(orgId);
    const summary = getUnblockQueueSummary(orgId);

    return NextResponse.json({
      success: true,
      queue,
      summary,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'edit', 'cash_unblock');
    if (permissionError) return permissionError;

    const body = await request.json();
    const { actionType } = body;

    // Enforce read-only pilot mode: no financial mutations during design partner pilot
    const pilotError = validatePilotReadOnly(context!.organization.id, 'FINANCIAL_TRANSACTION');
    if (pilotError) return pilotError;

    const { searchParams } = new URL(request.url);
    const orgId = context!.organization.id;
    udmStore.setTenantContext(orgId);

    const { itemId, invoiceId, owner, idempotencyKey } = body;

    // Handle read-only owner assignment (pilot-allowed). Acknowledged without
    // claiming persistence — no owner-assignment store mechanism exists yet.
    if (actionType === 'ASSIGN_OWNER') {
      return NextResponse.json({
        success: true,
        message: 'Owner assignment acknowledged.',
        itemId,
        invoiceId,
        owner,
      });
    }

    // Handle controlled action execution. Direct execution without an approved
    // action is not supported — actions must flow through the Approval Center
    // for human review and authorization before execution.
    if (actionType === 'EXECUTE_ACTION') {
      const executePermissionError = validatePermission(context, 'execute', 'cash_unblock');
      if (executePermissionError) return executePermissionError;
      return NextResponse.json({
        success: false,
        error: 'Direct execution not supported. Submit actions through the Approval Center for human review and authorization.',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: `Unknown action type: ${actionType}`,
    }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}