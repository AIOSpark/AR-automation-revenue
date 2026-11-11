import { NextResponse } from 'next/server';
import { ApprovalConflictError, approvalStore } from '@/lib/approvals/store';
import { can } from '@/lib/tenant/permissions';
import { udmStore } from '@/lib/udm/store';
import { exceptionEngine } from '@/lib/exceptions/engine';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';
import { adapterRegistry } from '@/lib/adapters/registry';
import { integrationsStore } from '@/lib/adapters/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'approve', 'approvals');
    if (permissionError) return permissionError;
    const { id } = await params;
    const body = await request.json();
    const { action, reason, modification } = body;
    const reviewerRole = context!.role;
    const reviewerUserId = context!.user.id;
    const orgId = context!.organization.id;

    const appReq = approvalStore.getRequest(id);
    if (!appReq) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    // Approval IDs are globally addressable in the in-memory store, so always
    // enforce the active tenant boundary before reading or mutating one.
    if (appReq.organization_id !== context!.organization.id) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    // Terminal financial decisions require authority over the underlying
    // resource, not just generic approval permission.
    const actionResource =
      appReq.action_type === 'ISSUE_CREDIT_NOTE'
        ? 'credit_notes'
        : appReq.action_type === 'RECORD_PAYMENT_MATCH' || appReq.action_type === 'ALLOCATE_PAYMENT'
          ? 'reconciliation'
          : 'invoices';
    const actionPermissionError = validatePermission(context, 'approve', actionResource);
    if (actionPermissionError) return actionPermissionError;

    // Read-only pilot mode: rejection is internal review only (no execution).
    // Approve/modify of financial or external actions is prohibited during pilot.
    if (action === 'approve' || action === 'modify') {
      const proposedAction = appReq.proposed_action || {};
      const actionType = appReq.action_type || proposedAction.action;

      const isExternalCommunication =
        actionType === 'SEND_CUSTOMER_COMMUNICATION' || proposedAction.content_type;
      const isErpWriteback = proposedAction.action === 'correct_invoice_tax_schedule';
      const isPaymentMatch =
        proposedAction.action === 'payment_reconciliation_match' ||
        appReq.action_type === 'RECORD_PAYMENT_MATCH';

      if (isExternalCommunication) {
        const pilotError = validatePilotReadOnly(orgId, 'EXTERNAL_CUSTOMER_COMMUNICATION');
        if (pilotError) return pilotError;
      } else if (isErpWriteback) {
        const pilotError = validatePilotReadOnly(orgId, 'ERP_WRITEBACK');
        if (pilotError) return pilotError;
      } else if (isPaymentMatch) {
        const pilotError = validatePilotReadOnly(orgId, 'PAYMENT_INITIATION');
        if (pilotError) return pilotError;
      }
      // Otherwise: internal review action (e.g., exception status transition)
      // is allowed during pilot mode as human review.
    }

  udmStore.setTenantContext(context!.organization.id);

  // 1. RBAC PERMISSION GATE: Verify user has permission to approve
  const isAllowed = can(reviewerRole as any, 'approve', 'approvals');
  if (!isAllowed) {
    return NextResponse.json(
      { error: `Forbidden: Role '${reviewerRole}' is not permitted to perform approval actions.` },
      { status: 403 }
    );
  }

  // Validate all required communication data before changing the approval
  // state. A malformed approval must remain pending for correction/review.
  if ((appReq.action_type === 'SEND_CUSTOMER_COMMUNICATION' || appReq.proposed_action?.content_type) && (action === 'approve' || action === 'modify')) {
    const finalPayload = action === 'modify' && modification ? { ...appReq.proposed_action, ...modification } : appReq.proposed_action;
    const targetCustomer = typeof finalPayload.customer_id === 'string'
      ? udmStore.getCustomers().find((customer) => customer.id === finalPayload.customer_id)
      : undefined;
    const targetInvoice = typeof finalPayload.invoice_id === 'string'
      ? udmStore.getInvoices().find((invoice) => invoice.id === finalPayload.invoice_id)
      : undefined;
    const verifiedContact = targetCustomer
      ? udmStore.getContacts(targetCustomer.id).some((contact) => contact.email.toLowerCase() === finalPayload.recipient_email.toLowerCase())
      : false;
    if (
      typeof finalPayload.recipient_email !== 'string' ||
      !finalPayload.recipient_email.includes('@') ||
      typeof finalPayload.subject !== 'string' ||
      !finalPayload.subject.trim() ||
      typeof finalPayload.body !== 'string' ||
      !finalPayload.body.trim() ||
      typeof finalPayload.customer_id !== 'string' ||
      !finalPayload.customer_id.trim() ||
      !targetCustomer ||
      (finalPayload.invoice_id !== null && finalPayload.invoice_id !== undefined && !targetInvoice) ||
      (targetInvoice && targetInvoice.customer_id !== targetCustomer.id) ||
      !verifiedContact
    ) {
      return NextResponse.json(
        { error: 'Communication approval requires a valid recipient, subject, body, and customer_id' },
        { status: 422 }
      );
    }
  }

  let updatedRequest;
  try {
    if (action === 'approve') {
      updatedRequest = approvalStore.approveRequest(id, reviewerUserId);
    } else if (action === 'reject') {
      updatedRequest = approvalStore.rejectRequest(id, reviewerUserId, reason);
    } else if (action === 'modify') {
      if (!modification || typeof modification !== 'object' || Array.isArray(modification)) {
        return NextResponse.json({ error: 'Modification payload is required for modify action' }, { status: 400 });
      }
      updatedRequest = approvalStore.modifyAndApproveRequest(id, reviewerUserId, modification);
    } else {
      return NextResponse.json({ error: 'Invalid action. Must be approve, reject, or modify' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ApprovalConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 }
      );
    }
    throw error;
  }

  try {
    // 2. REAL EXECUTION REFLECTION FOR UNDERLYING EXCEPTION / RECORD OR COMMUNICATION
    if (appReq.action_type === 'SEND_CUSTOMER_COMMUNICATION' || appReq.proposed_action?.content_type) {
      if (action === 'approve' || action === 'modify') {
        const finalPayload = action === 'modify' && modification ? { ...appReq.proposed_action, ...modification } : appReq.proposed_action;
        const { TransactionalEmailProvider } = await import('@/lib/communication/email-provider');
        const { communicationStore } = await import('@/lib/communication/store');

        const sendResult = await TransactionalEmailProvider.sendEmail({
          toEmail: finalPayload.recipient_email,
          subject: finalPayload.subject,
          body: finalPayload.body,
          organizationId: appReq.organization_id,
          simulateFailure: body.simulateFailure,
        });

        communicationStore.logSentMessage({
          organization_id: appReq.organization_id,
          customer_id: finalPayload.customer_id,
          invoice_id: finalPayload.invoice_id || null,
          content_type: finalPayload.content_type || 'payment_reminder',
          channel: 'email',
          subject: finalPayload.subject,
          body: finalPayload.body,
          approval_request_id: appReq.id,
          status: sendResult.success ? 'sent' : 'failed',
          error_detail: sendResult.errorDetail || null,
        });

        if (!sendResult.success) throw new Error(sendResult.errorDetail || 'Email delivery failed');
      }
    }

    if (appReq.subject_type === 'exception' || appReq.proposed_action?.exception_id) {
      const excId = appReq.subject_id || appReq.proposed_action?.exception_id;
      if (excId) {
        await udmStore.transaction(() => {
          if (action === 'reject') {
            exceptionEngine.transitionException(excId, 'rejected', appReq.organization_id);
          } else {
            exceptionEngine.transitionException(excId, 'approved', appReq.organization_id);
            const exc = exceptionEngine.transitionException(excId, 'executed', appReq.organization_id);

            if (action === 'modify' && modification) {
              udmStore.updateException(exc.id, {
                recommended_action: modification.recommended_action || exc.recommended_action,
                ...(modification.category ? { type: modification.category } : {}),
              });
            }
          }
        });
      }
    }

    // 3. PAYMENT RECONCILIATION MATCH EXECUTION REFLECTION
    if (appReq.proposed_action?.action === 'payment_reconciliation_match' || appReq.action_type === 'RECORD_PAYMENT_MATCH') {
      const { reconciliationEngine } = await import('@/lib/reconciliation/engine');
      if (action === 'approve' || action === 'modify') {
        await reconciliationEngine.executeApprovedMatch(id, reviewerUserId, modification || undefined);
      } else if (action === 'reject') {
        await reconciliationEngine.executeRejectedMatch(id, reviewerUserId, reason);
      }
    }

    if (appReq.proposed_action?.action === 'correct_invoice_tax_schedule' && (action === 'approve' || action === 'modify')) {
      const payload = action === 'modify' && modification ? { ...appReq.proposed_action, ...modification } : appReq.proposed_action;
      const invoice = typeof payload.invoice_id === 'string' ? udmStore.getInvoices().find((item) => item.id === payload.invoice_id) : undefined;
      const rate = Number(payload.corrected_tax_rate);
      if (!invoice || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Tax correction requires a valid invoice and rate between 0 and 100.');
      const integration = integrationsStore.getIntegrationByOrgAndAdapter(appReq.organization_id, invoice.source_system as any);
      if (!integration) throw new Error(`No ${invoice.source_system} integration is configured for ERP writeback.`);
      const adapter = adapterRegistry.getAdapter(invoice.source_system);
      const config = integrationsStore.getDecryptedConfig(integration) as any;
      const sourceResult = await adapter.pushAction({ ...config, organizationId: appReq.organization_id, adapterType: invoice.source_system }, {
        action: 'correct_invoice_tax_schedule',
        invoice_id: invoice.source_id,
        corrected_tax_rate: rate,
      });
      if (!sourceResult.success) throw new Error(sourceResult.error || 'ERP writeback failed.');
      await udmStore.transaction(() => {
        udmStore.updateInvoice(invoice.id, {
          tax_amount_minor_units: Math.round(invoice.amount_minor_units * rate / 100),
        }, reviewerUserId);
      });
    }

    if (action === 'approve' || action === 'modify') {
      updatedRequest = approvalStore.markExecutionResult(id, 'succeeded');
    }
  } catch (error: any) {
    if (action === 'approve' || action === 'modify') {
      updatedRequest = approvalStore.markExecutionResult(id, 'failed', error?.message || 'Approval execution failed');
    }
    return NextResponse.json({
      success: false,
      error: error?.message || 'Approval was recorded but execution failed',
      request: updatedRequest,
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    request: updatedRequest,
  });
}
