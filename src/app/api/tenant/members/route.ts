import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { tenantStore } from "@/lib/tenant/store";

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "view", "users_invites");
  if (permissionError) return permissionError;

  const members = tenantStore.getOrgMembers(context!.organization.id);
  const invites = tenantStore.getOrgInvites(context!.organization.id);

  return NextResponse.json({
    organization: context!.organization,
    currentRole: context!.role,
    members: members.map((m) => ({
      id: m.member.id,
      user_id: m.member.user_id,
      email: m.user?.email,
      name: m.user ? `${m.user.first_name} ${m.user.last_name}` : "Unknown User",
      role: m.member.role,
      created_at: m.member.created_at,
    })),
    pendingInvites: invites,
  });
}
