import { NextResponse } from 'next/server';
import { queryReceivablesTable, savedFilterStore } from '@/lib/receivables/engine';
import { InvoiceStatus } from '@/lib/udm/types';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { parsePagination } from '@/lib/api/pagination';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(req.url);
    const orgId = context!.organization.id;
    const customerId = searchParams.get('customerId') || undefined;
    const minAmount = searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined;
    const maxAmount = searchParams.get('maxAmount') ? parseFloat(searchParams.get('maxAmount')!) : undefined;
    const ageBucket = searchParams.get('ageBucket') as any || undefined;
    const statusParam = searchParams.get('status');
    const statuses = statusParam ? (statusParam.split(',') as InvoiceStatus[]) : undefined;
    const risk = searchParams.get('risk') as any || undefined;
    const industry = searchParams.get('industry') || undefined;
    const ownerUserId = searchParams.get('ownerUserId') || undefined;

    const sortBy = searchParams.get('sortBy') as any || 'due_date';
    const sortOrder = searchParams.get('sortOrder') as any || 'asc';
    const { page, pageSize } = parsePagination(searchParams);

    const result = queryReceivablesTable(orgId, {
      customerId,
      minAmount,
      maxAmount,
      ageBucket,
      statuses,
      risk,
      industry,
      ownerUserId,
      sortBy,
      sortOrder,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to query receivables table' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;
    const orgId = context!.organization.id;

    // Read-only pilot mode: saving a filter view is an internal workflow record.
    const pilotError = validatePilotReadOnly(orgId, 'CUSTOMER_RECORD_MUTATION');
    if (pilotError) return pilotError;

    const body = await req.json();
    const { name, filterConfig } = body;

    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80 || !filterConfig || typeof filterConfig !== 'object' || Array.isArray(filterConfig)) {
      return NextResponse.json({ error: 'A view name and filter configuration are required' }, { status: 400 });
    }

    const saved = savedFilterStore.saveView(context!.organization.id, context!.user.id, name.trim(), filterConfig);
    return NextResponse.json({ success: true, savedView: saved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save filter view' }, { status: 500 });
  }
}
