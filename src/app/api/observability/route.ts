// AIOSpark Observability & AI Tasks API Endpoint (Layer 29)

import { NextResponse } from 'next/server';
import { observabilityStore } from '@/lib/observability/store';
import { aiQualityStore, TAXONOMY_CATEGORIES } from '@/lib/observability/ai-quality';
import { ObservabilityAlertEngine } from '@/lib/observability/alerts';
import { ModelValidationRunner } from '@/lib/observability/model-validation';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'view', 'organization_settings');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(request.url);
    const orgId = context!.organization.id;

    // 1. AI Quality Metrics & Summary
    const aggregateSummary = aiQualityStore.getAggregateSummary(orgId);

    // 2. Trend Data per category
    const trends: Record<string, any> = {};
    for (const cat of TAXONOMY_CATEGORIES) {
      trends[cat] = aiQualityStore.getCategoryTrends(cat, orgId);
    }

    // 3. Infrastructure & API Metrics
    const apiMetrics = observabilityStore.getApiMetrics(undefined, orgId);
    const unitCost = observabilityStore.getCustomerUnitCost(orgId);
    const agentMetrics = observabilityStore.getAgentMetrics(undefined, orgId);
    const integrationMetrics = observabilityStore.getIntegrationSyncMetrics(undefined, orgId);

    // 4. Alert Checks
    const qualityAlerts = ObservabilityAlertEngine.checkAIQualityAlerts(orgId);
    const infraAlerts = ObservabilityAlertEngine.checkInfrastructureAlerts(orgId);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      aiQuality: {
        summary: aggregateSummary,
        trends,
        activeAlerts: qualityAlerts,
      },
      infrastructure: {
        apiMetrics,
        unitCost,
        agentMetricsCount: agentMetrics.length,
        integrationSyncCount: integrationMetrics.length,
        activeAlerts: infraAlerts,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'edit', 'organization_settings');
    if (permissionError) return permissionError;
    const body = await request.json();
    const { action, candidateModelVersion, candidatePromptVersion } = body;

    if (action === 'validate_model') {
      const report = await ModelValidationRunner.validateCandidateModel({
        candidateModelVersion: candidateModelVersion || 'AIOSpark-Candidate-v2.0',
        candidatePromptVersion: candidatePromptVersion || 'v2.1-prod',
      });
      return NextResponse.json({ success: true, report });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
