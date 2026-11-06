import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { integrationsStore } from "@/lib/adapters/store";
import { adapterRegistry } from "@/lib/adapters/registry";
import { integrationSyncEngine } from "@/lib/integrations/sync-engine";

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "view", "integrations");
  if (permissionError) return permissionError;

  const orgId = context!.organization.id;
  const registeredTypes = adapterRegistry.getRegisteredAdapterTypes();
  const orgIntegrations = integrationsStore.getOrgIntegrations(orgId);
  const dataHealth = integrationSyncEngine.getOrgDataHealth(orgId);
  const recentJobs = integrationSyncEngine.getJobsForOrg(orgId).slice(0, 10);
  const recordErrors = integrationSyncEngine.getErrorsForOrg(orgId);

  const statuses = await Promise.all(
    registeredTypes.map(async (adapterType) => {
      const adapter = adapterRegistry.getAdapter(adapterType);
      const record = orgIntegrations.find((i) => i.adapter_type === adapterType);

      const config = record
        ? { organizationId: orgId, adapterType, credentialsEncrypted: record.config_encrypted }
        : { organizationId: orgId, adapterType };

      const health = await adapter.getConnectionHealth(config);

      return {
        adapterType,
        name:
          adapterType === "csv"
            ? "CSV / Excel Ingestion"
            : adapterType === "zoho"
            ? "Zoho Books"
            : adapterType === "tally"
            ? "Tally Prime / ERP 9"
            : "Bank Statements",
        status: record?.status || health.status,
        lastSyncAt: record?.last_sync_at || health.lastSyncAt || null,
        lastError: record?.last_error || health.lastError || null,
        isConfigured: Boolean(record),
      };
    })
  );

  return NextResponse.json({
    organizationId: orgId,
    integrations: statuses,
    dataHealth,
    recentJobs,
    recordErrors,
  });
}

