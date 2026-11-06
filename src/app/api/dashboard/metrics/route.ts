import { NextResponse } from 'next/server';
import { dashboardMetricsStore } from '@/lib/dashboard/engine';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(req.url);
    const orgId = context!.organization.id;
    const refresh = searchParams.get('refresh') === 'true';

    let metrics;
    if (refresh) {
      metrics = dashboardMetricsStore.refreshMetrics(orgId);
    } else {
      metrics = dashboardMetricsStore.getCachedMetrics(orgId);
    }

    return NextResponse.json({
      success: true,
      metrics: {
        totalReceivables: metrics.totalReceivablesMinorUnits / 100,
        totalReceivablesMinorUnits: metrics.totalReceivablesMinorUnits,
        overdue: metrics.overdueMinorUnits / 100,
        overdueMinorUnits: metrics.overdueMinorUnits,
        atRisk: metrics.atRiskMinorUnits / 100,
        atRiskMinorUnits: metrics.atRiskMinorUnits,
        cashUnblockedOpportunity: metrics.cashUnblockedOpportunityMinorUnits / 100,
        cashUnblockedOpportunityMinorUnits: metrics.cashUnblockedOpportunityMinorUnits,
        computedAt: metrics.computedAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load dashboard metrics' }, { status: 500 });
  }
}
