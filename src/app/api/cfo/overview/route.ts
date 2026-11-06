import { NextRequest, NextResponse } from 'next/server';
import { cfoIntelligenceEngine } from '@/lib/cfo/engine';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;

  const orgId = context!.organization.id;

  udmStore.setTenantContext(orgId);

  const overview = cfoIntelligenceEngine.getOverview(orgId);
  return NextResponse.json(overview);
}
