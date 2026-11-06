import { NextResponse } from 'next/server';
import { analyzeInvoice } from '@/lib/intelligence/reasoning-engine';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoiceId');
    const orgId = context!.organization.id;

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId parameter is required' }, { status: 400 });
    }

    udmStore.setTenantContext(orgId);
    if (!udmStore.getInvoices().some((invoice) => invoice.id === invoiceId)) {
      return NextResponse.json({ error: 'Invoice not found in the active organization' }, { status: 404 });
    }

    const analysis = await analyzeInvoice(invoiceId, orgId);
    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to analyze invoice' }, { status: 500 });
  }
}
