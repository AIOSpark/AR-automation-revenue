import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { integrationSyncEngine } from '@/lib/integrations/sync-engine';
import { sanitizeSyncCustomConfig } from '@/lib/integrations/sync-config';
import { adapterRegistry } from '@/lib/adapters/registry';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized session context' }, { status: 401 });
    }

    // RBAC Guard: Permission required to edit integrations
    const permissionError = validatePermission(context, 'edit', 'integrations');
    if (permissionError) {
      return permissionError;
    }

    const body = await request.json();
    const { adapterType, customConfig } = body;

    if (typeof adapterType !== 'string' || !adapterType.trim()) {
      return NextResponse.json({ error: 'adapterType is required' }, { status: 400 });
    }

    if (!adapterRegistry.getRegisteredAdapterTypes().includes(adapterType)) {
      return NextResponse.json({ error: `Unsupported adapterType: ${adapterType}` }, { status: 400 });
    }

    const sanitizedConfig = await sanitizeSyncCustomConfig(adapterType, customConfig);
    if (!sanitizedConfig.ok) {
      return NextResponse.json({ error: sanitizedConfig.error }, { status: 400 });
    }

    // Read-only pilot mode: ERP sync is a bank/ERP writeback.
    const pilotError = validatePilotReadOnly(context.organization.id, 'ERP_WRITEBACK');
    if (pilotError) return pilotError;

    const jobRecord = await integrationSyncEngine.executeSync(
      context.organization.id,
      adapterType,
      context.user.id,
      sanitizedConfig.config
    );

    return NextResponse.json({
      success: jobRecord.status !== 'FAILED',
      job: jobRecord,
      summary: {
        status: jobRecord.status,
        discovered: jobRecord.recordsDiscovered,
        processed: jobRecord.recordsProcessed,
        created: jobRecord.recordsCreated,
        updated: jobRecord.recordsUpdated,
        skipped: jobRecord.recordsSkipped,
        failed: jobRecord.recordsFailed,
        errorSummary: jobRecord.errorSummary,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}

