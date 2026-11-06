import { NextResponse } from 'next/server';
import { promiseStore, PromiseRecordedVia } from '@/lib/promises/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { udmStore } from '@/lib/udm/store';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

const VALID_RECORDING_CHANNELS = new Set<PromiseRecordedVia>([
  'manual_phone_call',
  'manual_note',
  'email_parsed',
  'whatsapp_parsed',
]);

export async function GET(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'customers');
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const orgId = context!.organization.id;
  const customerId = searchParams.get('customer_id') || undefined;

  const promises = promiseStore.getPromises(orgId, customerId);

  let stats = null;
  if (customerId) {
    stats = promiseStore.getBrokenPromiseStats(orgId, customerId);
  }

  return NextResponse.json({
    promises,
    stats,
  });
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'create', 'customers');
    if (permissionError) return permissionError;
    const organization_id = context!.organization.id;

    // Read-only pilot mode: promise recording is an internal workflow record.
    const pilotError = validatePilotReadOnly(organization_id, 'CUSTOMER_RECORD_MUTATION');
    if (pilotError) return pilotError;

    const body = await request.json();
    const {
      customer_id,
      invoice_id,
      promised_amount_minor_units,
      currency,
      expected_date,
      recorded_via,
    } = body;

    // Strict validation: recorded_via MUST be provided
    if (!customer_id || typeof customer_id !== 'string' || !VALID_RECORDING_CHANNELS.has(recorded_via as PromiseRecordedVia)) {
      return NextResponse.json(
        { error: "customer_id and a valid recorded_via channel are required" },
        { status: 400 }
      );
    }

    udmStore.setTenantContext(organization_id);
    const customerExists = udmStore.getCustomers().some((customer) => customer.id === customer_id);
    if (!customerExists) {
      return NextResponse.json({ error: 'Customer does not belong to the active organization.' }, { status: 404 });
    }

    if (invoice_id !== undefined && invoice_id !== null) {
      const invoiceExists = udmStore.getInvoices().some((invoice) => invoice.id === invoice_id && invoice.customer_id === customer_id);
      if (!invoiceExists) {
        return NextResponse.json({ error: 'Invoice does not belong to the selected customer and organization.' }, { status: 400 });
      }
    }

    const amount = Number(promised_amount_minor_units);
    if (!Number.isInteger(amount) || amount <= 0 || typeof expected_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expected_date)) {
      return NextResponse.json({ error: 'A positive integer amount and YYYY-MM-DD expected_date are required.' }, { status: 400 });
    }

    const promise = promiseStore.createPromise({
      organization_id,
      customer_id,
      invoice_id,
      promised_amount_minor_units: amount,
      currency: currency || 'INR',
      expected_date,
      recorded_via: recorded_via as PromiseRecordedVia,
      recorded_by_user_id: context!.user.id,
    });

    return NextResponse.json({
      success: true,
      promise,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to record promise' }, { status: 400 });
  }
}
