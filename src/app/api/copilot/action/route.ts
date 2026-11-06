import { NextRequest, NextResponse } from 'next/server';
import { approvalStore } from '@/lib/approvals/store';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { withApiMetric } from '@/lib/observability/api-metrics';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

const SUPPORTED_ACTIONS = new Set(['EXECUTE_PO_CORRECTION', 'DRAFT_EMAIL']);

export async function POST(request: NextRequest) {
  return withApiMetric('/api/copilot/action', async () => {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'create', 'approvals');
  if (permissionError) return permissionError;
  const organizationId = context!.organization.id;

  // Read-only pilot mode: copilot actions create approvals for invoice modification or customer communication.
  const pilotError = validatePilotReadOnly(organizationId, 'EXTERNAL_CUSTOMER_COMMUNICATION');
  if (pilotError) return pilotError;

  const body = await request.json();
  const { actionType, payload } = body;

  if (!SUPPORTED_ACTIONS.has(actionType) || !payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Unsupported Copilot action.' }, { status: 400 });
  }

  if (body.idempotencyKey !== undefined &&
      (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.trim().length > 128)) {
    return NextResponse.json({ error: 'idempotencyKey must be 8-128 characters.' }, { status: 400 });
  }

  udmStore.setTenantContext(context!.organization.id);
  const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
    ? body.idempotencyKey.trim()
    : `copilot:${context!.user.id}:${actionType}:${typeof payload.invoiceId === 'string' ? payload.invoiceId : typeof payload.customerId === 'string' ? payload.customerId : 'unknown'}`;
  const existingRequest = approvalStore.findByIdempotencyKey(context!.organization.id, idempotencyKey);
  if (existingRequest) {
    const existingAction = existingRequest.proposed_action?.action;
    const requestedAction = actionType === 'DRAFT_EMAIL' ? 'send_customer_communication' : 'correct_invoice_tax_schedule';
    const existingInvoiceId = existingRequest.proposed_action?.invoice_id || null;
    const requestedInvoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId.trim() : null;
    const existingCustomerId = existingRequest.proposed_action?.customer_id || null;
    const requestedCustomerId = typeof payload.customerId === 'string' ? payload.customerId.trim() : null;
    if (existingAction !== requestedAction || existingInvoiceId !== requestedInvoiceId || existingCustomerId !== requestedCustomerId) {
      return NextResponse.json({ error: 'Idempotency key was already used for a different action.' }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      status: 'pending_approval',
      idempotent: true,
      request: existingRequest,
    });
  }

  const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId.trim() : '';
  const invoice = invoiceId ? udmStore.getInvoices().find((candidate) => candidate.id === invoiceId) : undefined;
  const customerId = typeof payload.customerId === 'string' ? payload.customerId.trim() : '';
  const customer = customerId ? udmStore.getCustomers().find((candidate) => candidate.id === customerId) : undefined;

  if (actionType === 'EXECUTE_PO_CORRECTION' && !invoice) {
    return NextResponse.json({ error: 'A valid invoice from the active organization is required.' }, { status: 422 });
  }
  const derivedTaxRate = invoice && invoice.amount_minor_units > 0
    ? (invoice.tax_amount_minor_units / invoice.amount_minor_units) * 100
    : 0;
  const requestedTaxRate = payload.correctedTaxRate === undefined ? derivedTaxRate : Number(payload.correctedTaxRate);
  if (actionType === 'EXECUTE_PO_CORRECTION' && (!Number.isFinite(requestedTaxRate) || requestedTaxRate < 0 || requestedTaxRate > 100)) {
    return NextResponse.json({ error: 'correctedTaxRate must be a number between 0 and 100.' }, { status: 422 });
  }
  if (actionType === 'EXECUTE_PO_CORRECTION' && customerId && invoice && invoice.customer_id !== customerId) {
    return NextResponse.json({ error: 'The invoice does not belong to the selected customer.' }, { status: 422 });
  }
  if (actionType === 'DRAFT_EMAIL') {
    const recipient = typeof payload.to === 'string' ? payload.to.trim() : '';
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const emailBody = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (!customer || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !subject || !emailBody) {
      return NextResponse.json({ error: 'Email drafts require an active-tenant customer, valid recipient, subject, and body.' }, { status: 422 });
    }
    const verifiedContact = udmStore.getContacts(customer.id).some((contact) => contact.email.toLowerCase() === recipient.toLowerCase());
    if (!verifiedContact) {
      return NextResponse.json({ error: 'The recipient must match a verified contact for the selected customer.' }, { status: 422 });
    }
    if (invoice && invoice.customer_id !== customer.id) {
      return NextResponse.json({ error: 'The invoice does not belong to the selected customer.' }, { status: 422 });
    }
  }

  const isEmail = actionType === 'DRAFT_EMAIL';
  const requestRecord = approvalStore.createRequest({
    organization_id: context!.organization.id,
    subject_type: 'invoice',
    subject_id: invoice?.id || customer?.id || 'pending_review',
    action_type: isEmail ? 'SEND_CUSTOMER_COMMUNICATION' : 'ALTER_INVOICE_VALUE',
    proposed_action: isEmail
      ? {
          action: 'send_customer_communication',
          content_type: 'payment_reminder',
          recipient_email: payload.to.trim(),
          subject: payload.subject.trim(),
          body: payload.body.trim(),
          customer_id: customer!.id,
          invoice_id: invoice?.id || null,
          idempotency_key: idempotencyKey,
        }
      : {
          action: 'correct_invoice_tax_schedule',
          invoice_id: invoice!.id,
          invoice_number: invoice!.number,
          customer_name: customer?.name || udmStore.getCustomers().find((candidate) => candidate.id === invoice!.customer_id)?.name,
          amount: invoice!.amount_minor_units,
          corrected_tax_rate: Math.round(requestedTaxRate * 100) / 100,
          idempotency_key: idempotencyKey,
        },
    evidence: [
      { source: 'Spark Copilot', reason: 'User explicitly requested a reviewable action.' },
    ],
    confidence: Number(payload.confidence || 0) / 100,
    proposed_by: 'Spark Copilot',
  });

  return NextResponse.json({
    success: true,
    status: 'pending_approval',
    request: requestRecord,
  });
  });
}
