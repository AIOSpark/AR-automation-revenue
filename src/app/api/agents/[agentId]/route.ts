import { NextResponse } from 'next/server';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;
  const { agentId } = await params;
  const orgId = context!.organization.id;

  udmStore.setTenantContext(orgId);

  const detail = AgentRegistryService.getAgentDetail(agentId, orgId);

  if (!detail) {
    return NextResponse.json({ error: `Agent not found: ${agentId}` }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'approve', 'approvals');
    if (permissionError) return permissionError;
    const { agentId } = await params;
    const body = await request.json();
    const orgId = context!.organization.id;

    // Read-only pilot mode: agent execution is autonomous financial execution.
    const pilotError = validatePilotReadOnly(orgId, 'AUTONOMOUS_EXECUTION');
    if (pilotError) return pilotError;
    const payload = body.payload;

    const result = await AgentRegistryService.executeAgentTrigger(agentId, orgId, payload);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || `Failed to execute agent` },
      { status: 400 }
    );
  }
}
