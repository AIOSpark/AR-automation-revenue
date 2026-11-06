import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { tenantStore } from "@/lib/tenant/store";
import { canGrantRole, Role } from "@/lib/tenant/permissions";
import { validateWorkEmail } from "@/lib/auth/config";

export async function POST(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "create", "users_invites");
  if (permissionError) return permissionError;

  try {
    const body = await request.json();
    const { email, role } = body;

    const emailCheck = validateWorkEmail(email);
    if (!emailCheck.isValid) {
      return NextResponse.json({ error: emailCheck.error || "Invalid email" }, { status: 400 });
    }

    const validRoles: Role[] = ["Owner", "Admin", "Finance Manager", "Finance Executive", "Viewer"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    if (!canGrantRole(context!.role, role)) {
      return NextResponse.json(
        { error: "Forbidden: You cannot invite a teammate with a role above your own" },
        { status: 403 }
      );
    }

    const invite = tenantStore.createInvite({
      organization_id: context!.organization.id,
      email,
      role,
      invited_by_user_id: context!.user.id,
    });

    return NextResponse.json({
      message: `Teammate invite sent to ${email} as ${role}`,
      invite,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
