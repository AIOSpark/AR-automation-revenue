import { NextResponse } from 'next/server';
import { approvalStore, ApprovalStatus } from '@/lib/approvals/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'approvals');
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const orgId = context!.organization.id;
  const status = searchParams.get('status') as ApprovalStatus | undefined;

  const requests = approvalStore.getRequests(orgId, status);
  const requestIds = new Set(requests.map((request) => request.id));
  const logs = approvalStore.getLogs().filter((log) => requestIds.has(log.approval_request_id));

  return NextResponse.json({
    requests,
    logs,
  });
}
