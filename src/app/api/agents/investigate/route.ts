import { NextResponse } from 'next/server';
import { runInvestigationAgent } from '@/lib/agents/investigation-agent';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { udmStore } from '@/lib/udm/store';

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;
    const body = await request.json();
    const {
      invoiceId,
      customerId,
      exceptionId,
      organizationId: _organizationId,
      investigationType = 'invoice',
      extendedContextDocs,
      userRole: _userRole,
    } = body;
    const organizationId = context!.organization.id;
    const userRole = context!.role;

    udmStore.setTenantContext(organizationId);
    if (invoiceId && !udmStore.getInvoices().some((invoice) => invoice.id === invoiceId)) {
      return NextResponse.json({ error: 'Invoice not found in the active organization' }, { status: 404 });
    }
    if (customerId && !udmStore.getCustomers().some((customer) => customer.id === customerId)) {
      return NextResponse.json({ error: 'Customer not found in the active organization' }, { status: 404 });
    }
    if (exceptionId && !udmStore.getExceptions().some((exception) => exception.id === exceptionId)) {
      return NextResponse.json({ error: 'Exception not found in the active organization' }, { status: 404 });
    }

    if (extendedContextDocs !== undefined && (!Array.isArray(extendedContextDocs) || extendedContextDocs.length > 20 || extendedContextDocs.some((doc) => typeof doc !== 'string' || doc.length > 4000))) {
      return NextResponse.json({ error: 'extendedContextDocs must contain at most 20 short text documents' }, { status: 400 });
    }

    if (!invoiceId && !customerId && !exceptionId) {
      return NextResponse.json({ error: 'At least one of invoiceId, customerId, or exceptionId must be provided' }, { status: 400 });
    }

    const result = await runInvestigationAgent({
      invoiceId,
      customerId,
      exceptionId,
      organizationId,
      investigationType,
      extendedContextDocs,
      userRole,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Investigation execution failed' }, { status: 500 });
  }
}
