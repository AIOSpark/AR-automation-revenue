import { NextResponse } from 'next/server';
import { buildCausalChain } from '@/lib/intelligence/advanced-engine';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(request.url);
    const orgId = context!.organization.id;
    const invoiceIdParam = searchParams.get('invoiceId');
    const customerIdParam = searchParams.get('customerId');
    const nodeIdParam = searchParams.get('nodeId');

    udmStore.setTenantContext(orgId);
    const invoices = udmStore.getInvoices();
    const customers = udmStore.getCustomers();

    if (invoiceIdParam && !invoices.some((invoice) => invoice.id === invoiceIdParam)) {
      return NextResponse.json({ success: false, error: 'Invoice not found in the active organization' }, { status: 404 });
    }

    if (customerIdParam && !customers.some((customer) => customer.id === customerIdParam)) {
      return NextResponse.json({ success: false, error: 'Customer not found in the active organization' }, { status: 404 });
    }

    let targetInvoiceId = invoiceIdParam;

    if (!targetInvoiceId && customerIdParam) {
      const custInvoices = invoices.filter((i) => i.customer_id === customerIdParam);
      if (custInvoices.length > 0) {
        targetInvoiceId = custInvoices[0].id;
      }
    }

    if (!targetInvoiceId && invoices.length > 0) {
      targetInvoiceId = invoices[0].id;
    }

    const availableCases = invoices.map((inv) => {
      const cust = customers.find((c) => c.id === inv.customer_id);
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        customerId: inv.customer_id,
        customerName: cust ? cust.name : 'Unknown Account',
        amountMinorUnits: inv.amount_minor_units,
        status: inv.status,
        dueDate: inv.due_date,
      };
    });

    let activeChain = null;
    let dataQuality = { verifiedCount: 0, inferredCount: 0, totalNodes: 0 };

    if (targetInvoiceId) {
      activeChain = buildCausalChain(targetInvoiceId, orgId);
      if (activeChain) {
        const verified = activeChain.nodes.filter((n) => n.provenance === 'VERIFIED').length;
        const inferred = activeChain.nodes.filter((n) => n.provenance === 'AI_INFERRED').length;
        dataQuality = {
          verifiedCount: verified,
          inferredCount: inferred,
          totalNodes: activeChain.nodes.length,
        };
      }
    }

    return NextResponse.json({
      success: true,
      activeInvoiceId: targetInvoiceId,
      activeChain,
      availableCases,
      dataQuality,
      dataSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
