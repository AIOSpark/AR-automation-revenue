import { NextResponse } from 'next/server';
import { queryExceptionsWorkspace, ExceptionQueryFilters } from '@/lib/exceptions/query-engine';
import { exceptionEngine } from '@/lib/exceptions/engine';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { parsePagination } from '@/lib/api/pagination';
import { tenantStore } from '@/lib/tenant/store';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'exceptions');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(req.url);
    const orgId = context!.organization.id;
    const status = searchParams.get('status') || undefined;
    const severity = searchParams.get('severity') || undefined;
    const type = searchParams.get('type') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const ownerId = searchParams.get('ownerId') || undefined;
    const search = searchParams.get('search') || undefined;
    const minAmount = searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined;
    const maxAmount = searchParams.get('maxAmount') ? parseFloat(searchParams.get('maxAmount')!) : undefined;
    const minAgeDays = searchParams.get('minAgeDays') ? parseInt(searchParams.get('minAgeDays')!, 10) : undefined;
    const maxAgeDays = searchParams.get('maxAgeDays') ? parseInt(searchParams.get('maxAgeDays')!, 10) : undefined;
    const sortBy = (searchParams.get('sortBy') as any) || undefined;
    const sortOrder = (searchParams.get('sortOrder') as any) || undefined;
    const { page, pageSize } = parsePagination(searchParams);

    const filters: ExceptionQueryFilters = {
      status,
      severity,
      type,
      customerId,
      ownerId,
      search,
      minAmount,
      maxAmount,
      minAgeDays,
      maxAgeDays,
      sortBy,
      sortOrder,
      page,
      pageSize,
    };

    const result = queryExceptionsWorkspace(orgId, filters);

    // Maintain backwards compatibility for legacy endpoints expecting `{ success: true, counts, exceptions }`
    udmStore.setTenantContext(orgId);
    let legacyExceptions = udmStore.getExceptions();
    if (severity) {
      legacyExceptions = legacyExceptions.filter((e) => e.severity === severity);
    }

    const legacyCounts = {
      critical: legacyExceptions.filter((e) => e.severity === 'critical').length,
      high: legacyExceptions.filter((e) => e.severity === 'high').length,
      medium: legacyExceptions.filter((e) => e.severity === 'medium').length,
      low: legacyExceptions.filter((e) => e.severity === 'low').length,
      unassigned: legacyExceptions.filter((e) => !e.owner_user_id).length,
    };

    return NextResponse.json({
      success: true,
      data: result,
      // Backwards compatibility keys
      counts: legacyCounts,
      exceptions: legacyExceptions,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to query Exception Intelligence workspace' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const context = await resolveTenantContext(req);
  const permissionError = validatePermission(context, 'edit', 'exceptions');
  if (permissionError) return permissionError;
  const orgId = context!.organization.id;

  // Read-only pilot mode: exception modification is a prohibited mutation.
  const pilotError = validatePilotReadOnly(orgId, 'INVOICE_MODIFICATION');
  if (pilotError) return pilotError;

  try {
    const body = await req.json();
    const { exceptionId, ownerUserId, toStatus } = body;
    const orgId = context!.organization.id;

    if (!exceptionId) {
      return NextResponse.json({ error: 'exceptionId is required' }, { status: 400 });
    }

    // Terminal financial decisions require approval authority, not merely edit.
    if (toStatus && ['approved', 'rejected', 'executed'].includes(toStatus)) {
      const approvalPermissionError = validatePermission(context, 'approve', 'exceptions');
      if (approvalPermissionError) return approvalPermissionError;
    }

    udmStore.setTenantContext(orgId);
    const exceptions = udmStore.getExceptions();
    const exc = exceptions.find((e) => e.id === exceptionId);

    if (!exc) {
      return NextResponse.json({ error: 'Exception not found' }, { status: 404 });
    }

    if (ownerUserId !== undefined) {
      if (ownerUserId !== null && typeof ownerUserId !== 'string') {
        return NextResponse.json({ error: 'ownerUserId must be a user ID or null' }, { status: 400 });
      }
      if (ownerUserId !== null && !tenantStore.getMember(ownerUserId, orgId)) {
        return NextResponse.json({ error: 'Owner must be a member of the active organization' }, { status: 422 });
      }
      exc.owner_user_id = ownerUserId;
      exc.updated_at = new Date().toISOString();
    }

    if (toStatus) {
      exceptionEngine.transitionException(exceptionId, toStatus, orgId);
    }

    return NextResponse.json({ success: true, exception: exc });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update exception' }, { status: 500 });
  }
}
