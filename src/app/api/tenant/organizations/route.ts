import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext } from "@/lib/tenant/middleware";
import { tenantStore } from "@/lib/tenant/store";

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized session" }, { status: 401 });
  }

  const userOrgs = tenantStore.getUserOrganizations(context.user.id);

  return NextResponse.json({
    activeOrganizationId: context.organization.id,
    activeRole: context.role,
    organizations: userOrgs.map((o) => ({
      id: o.organization.id,
      name: o.organization.name,
      size: o.organization.size,
      industry: o.organization.industry,
      role: o.role,
      isActive: o.organization.id === context.organization.id,
    })),
  });
}
