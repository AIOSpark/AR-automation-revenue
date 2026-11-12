import { NextRequest, NextResponse } from "next/server";
import { authStore } from "@/lib/auth/store";
import { tenantStore } from "@/lib/tenant/store";
import { verifySessionToken } from "@/lib/auth/session";
import { rateLimiterStore } from "@/lib/auth/rate-limiter";
import { trackAuthFunnelEvent } from "@/lib/auth/analytics";
import { AuditService } from "@/lib/audit/service";

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") || "";
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: `Too many organization creation attempts. Please retry after ${retryAfterSeconds} seconds.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = getCookie(request, "aiospark_session");
    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized: Invalid or missing session context" }, { status: 401 });
    }

    const userId = verifySessionToken(sessionToken);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Invalid or expired session" }, { status: 401 });
    }

    const user = authStore.getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Session invalid or user not found" }, { status: 401 });
    }

    // Reject unverified users
    if (!user.email_verified) {
      return NextResponse.json(
        { error: "Email verification is required before creating an organization" },
        { status: 403 }
      );
    }

    // Rate limit by user
    const accountLimit = rateLimiterStore.checkRateLimit(`org_create:user:${userId}`, "auth");
    if (!accountLimit.allowed) {
      return tooManyAttempts(accountLimit.retryAfterSeconds);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { name, size, industry } = body;

    if (!name || !size || !industry) {
      return NextResponse.json({ error: "Organization name, size, and industry are required" }, { status: 400 });
    }

    // Prevent duplicate organizations by name for this user
    const existingOrgs = tenantStore.getUserOrganizations(user.id);
    const duplicate = existingOrgs.find((o) => o.organization.name.toLowerCase() === name.trim().toLowerCase());
    if (duplicate) {
      return NextResponse.json(
        { error: "An organization with this name already exists" },
        { status: 409 }
      );
    }

    // Create organization and membership atomically
    let organization;
    try {
      organization = authStore.createOrganizationDraft({
        name: name.trim(),
        size,
        industry,
        created_by_user_id: user.id,
      });

      tenantStore.addMember(user.id, organization.id, "Owner", user.id);

      trackAuthFunnelEvent("signup_completed", {
        userId: user.id,
        organizationId: organization.id,
        organizationName: organization.name,
      });

      AuditService.record({
        organization_id: organization.id,
        actor_user_id: user.id,
        actor_type: "user",
        action_type: "organization.created",
        subject_type: "organization",
        subject_id: organization.id,
        after_state: { name: organization.name, size, industry },
        result: "success",
      });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || "Failed to create organization" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Organization created successfully",
      organization: {
        id: organization.id,
        name: organization.name,
        size: organization.size,
        industry: organization.industry,
        created_by_user_id: organization.created_by_user_id,
        created_at: organization.created_at,
      },
      membership: {
        user_id: user.id,
        organization_id: organization.id,
        role: "Owner",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
