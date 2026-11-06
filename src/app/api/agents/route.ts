import { NextResponse } from 'next/server';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { runReceivablesAnalyst, analystReportStore } from '@/lib/agents/receivables-analyst';
import { agentExecutorRegistry } from '@/lib/agents/executor';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const orgId = context!.organization.id;

  udmStore.setTenantContext(orgId);

  const agents = AgentRegistryService.getAllAgents();
  const fleetMetrics = AgentRegistryService.getFleetMetrics(orgId);
  const report = analystReportStore.getLatestReport(orgId);
  const logs = agentExecutorRegistry.getLogs(orgId);

  return NextResponse.json({
    agents,
    fleetMetrics,
    report,
    logs,
  });
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'approve', 'approvals');
    if (permissionError) return permissionError;
    const orgId = context!.organization.id;

    // Read-only pilot mode: agent execution is autonomous financial execution.
    const pilotError = validatePilotReadOnly(orgId, 'AUTONOMOUS_EXECUTION');
    if (pilotError) return pilotError;

    const body = await request.json();

    const agentId = body.agent_id || 'receivables-analyst';
    const payload = body.payload;

    const result = await AgentRegistryService.executeAgentTrigger(agentId, orgId, payload);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to execute agent trigger' },
      { status: 400 }
    );
  }
}