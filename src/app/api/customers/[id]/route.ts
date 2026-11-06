import { NextResponse } from 'next/server';
import { computeCustomerFinancialProfile } from '@/lib/customer/risk-engine';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'customers');
    if (permissionError) return permissionError;
    const orgId = context!.organization.id;
    const { id } = await params;
    const customerId = id || new URL(req.url).searchParams.get('customerId');
    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 });

    udmStore.setTenantContext(orgId);
    const profile = computeCustomerFinancialProfile(customerId, orgId);

    const invoices = udmStore.getInvoices().filter((i) => i.customer_id === customerId);
    const payments = udmStore.getPayments().filter((p) => p.customer_id === customerId);
    const disputes = udmStore.getDisputes().filter((d) => invoices.some((i) => i.id === d.invoice_id));

    return NextResponse.json({
      success: true,
      profile,
      tabsData: {
        invoices,
        payments,
        disputes,
        communications: [], // Placeholder for Layer 19
        promises: [], // Placeholder for Layer 20
        exceptions: [], // Placeholder for Layer 15
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load Customer 360 profile' }, { status: 500 });
  }
}
