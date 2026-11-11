import { NextResponse } from 'next/server';
import { queryCollectionsWorkspace, CollectionsQueryFilters } from '@/lib/collections/query-engine';
import { runCollectionsAgent } from '@/lib/agents/collections-agent';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { parsePagination } from '@/lib/api/pagination';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'collections');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(req.url);
    const orgId = context!.organization.id;
    const priority = (searchParams.get('priority') as any) || undefined;
    const risk = (searchParams.get('risk') as any) || undefined;
    const promiseStatus = (searchParams.get('promiseStatus') as any) || undefined;
    const hasBlocker = (searchParams.get('hasBlocker') as any) || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const ownerId = searchParams.get('ownerId') || undefined;
    const search = searchParams.get('search') || undefined;
    const minAmount = searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined;
    const maxAmount = searchParams.get('maxAmount') ? parseFloat(searchParams.get('maxAmount')!) : undefined;
    const minAgeDays = searchParams.get('minAgeDays') ? parseInt(searchParams.get('minAgeDays')!, 10) : undefined;
    const maxAgeDays = searchParams.get('maxAgeDays') ? parseInt(searchParams.get('maxAgeDays')!, 10) : undefined;
    const sortBy = (searchParams.get('sortBy') as any) || undefined;
    const sortOrder = (searchParams.get('sortOrder') as any) || undefined;
    const { page, pageSize } = parsePagination(searchParams);

    const filters: CollectionsQueryFilters = {
      priority,
      risk,
      promiseStatus,
      hasBlocker,
      customerId,
      ownerId,
      search,
      minAmount,
      maxAmount,
      minAgeDays,
      maxAgeDays,
      sortBy,
      sortOrder,
      page,
      pageSize,
    };

    const result = queryCollectionsWorkspace(orgId, filters);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to query Collections Intelligence workspace' }, { status: 500 });
  }
}

export async function POST(req: Request) {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'create', 'collections');
    if (permissionError) return permissionError;
    const organizationId = context!.organization.id;

    const pilotError = validatePilotReadOnly(organizationId, 'FINANCIAL_TRANSACTION');
    if (pilotError) return pilotError;

    // Read-only pilot mode: this endpoint drafts a collection follow-up internally.

  try {
    const body = await req.json();
    const { invoiceId, contentType = 'payment_reminder', documentTypeRequested, disputeReason } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required to prepare collection follow-up draft' }, { status: 400 });
    }

    udmStore.setTenantContext(organizationId);
    if (!udmStore.getInvoices().some((invoice) => invoice.id === invoiceId)) {
      return NextResponse.json({ error: 'Invoice not found in the active organization' }, { status: 404 });
    }

    const agentResult = await runCollectionsAgent({
      organizationId,
      invoiceId,
      contentType,
      documentTypeRequested,
      disputeReason,
    });

    return NextResponse.json({
      success: true,
      proposal: agentResult.data,
      actionProposed: agentResult.actionProposed,
      actionRecord: agentResult.actionRecord,
      log: agentResult.log,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to prepare collection draft' }, { status: 500 });
  }
}
