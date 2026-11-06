import { NextResponse } from 'next/server';
import { queryPaymentsWorkspace, PaymentsQueryFilters } from '@/lib/payments/query-engine';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { parsePagination } from '@/lib/api/pagination';

export async function GET(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(req.url);
    const orgId = context!.organization.id;
    const status = (searchParams.get('status') as any) || undefined;
    const source = (searchParams.get('source') as any) || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const search = searchParams.get('search') || undefined;
    const minAmount = searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined;
    const maxAmount = searchParams.get('maxAmount') ? parseFloat(searchParams.get('maxAmount')!) : undefined;
    const minAgeDays = searchParams.get('minAgeDays') ? parseInt(searchParams.get('minAgeDays')!, 10) : undefined;
    const maxAgeDays = searchParams.get('maxAgeDays') ? parseInt(searchParams.get('maxAgeDays')!, 10) : undefined;
    const sortBy = (searchParams.get('sortBy') as any) || undefined;
    const sortOrder = (searchParams.get('sortOrder') as any) || undefined;
    const { page, pageSize } = parsePagination(searchParams);

    const filters: PaymentsQueryFilters = {
      status,
      source,
      customerId,
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

    const result = queryPaymentsWorkspace(orgId, filters);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to query Payments Intelligence workspace' }, { status: 500 });
  }
}
