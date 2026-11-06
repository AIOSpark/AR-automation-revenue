// AIOSpark Multi-Tenant Request Middleware & Context Resolver

import { NextResponse } from "next/server";
import { authStore, UserRecord, OrganizationRecord } from "../auth/store";
import { tenantStore, OrgMemberRecord } from "./store";
import { Role, Action, Resource, can } from "./permissions";
import { verifySessionToken } from "../auth/session";

export interface ResolvedTenantContext {
  user: UserRecord;
  organization: OrganizationRecord;
  role: Role;
  member: OrgMemberRecord;
}

/**
 * Resolves active tenant context for incoming API requests.
 * Validates session token, active organization ID cookie/header, and user's membership in target tenant.
 */
function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") || "";
  const entry = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

export async function resolveTenantContext(request: Request): Promise<ResolvedTenantContext | null> {
  const sessionToken = getCookie(request, "aiospark_session");
  if (!sessionToken) {
    return null;
  }

  const userId = verifySessionToken(sessionToken);
  if (!userId) return null;

  let user = userId ? authStore.getUserById(userId) : null;
  if (!user) return null;

  // Determine target organization ID (from header, cookie, or primary membership)
  const headerOrgId = request.headers.get("x-organization-id");
  const cookieOrgId = getCookie(request, "aiospark_active_org");
  
  let targetOrgId = headerOrgId || cookieOrgId;

  // Fallback to user's first organization
  if (!targetOrgId) {
    const userOrgs = tenantStore.getUserOrganizations(user.id);
    if (userOrgs.length > 0) {
      targetOrgId = userOrgs[0].organization.id;
    }
  }

  if (!targetOrgId) {
    const org = authStore.getOrganizationByUserId(user.id);
    if (!org) return null;
    targetOrgId = org.id;
  }

  // Validate User Membership in Target Tenant
  const member = tenantStore.getMember(user.id, targetOrgId);
  if (!member) return null;

  const organization = authStore.getOrganizationById(targetOrgId);
  if (!organization) {
    return null;
  }

  // Inject Postgres RLS Session Variable Context
  tenantStore.setSessionTenantContext(organization.id);

  return {
    user,
    organization,
    role: member.role,
    member,
  };
}

/**
 * Enforces permission check for a given request.
 * Returns null if allowed, or an error NextResponse if denied.
 */
export function validatePermission(
  context: ResolvedTenantContext | null,
  action: Action,
  resource: Resource
): NextResponse | null {
  if (!context) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing session context" }, { status: 401 });
  }

  const isAllowed = can(context.role, action, resource);
  if (!isAllowed) {
    return NextResponse.json(
      {
        error: `Forbidden: Role '${context.role}' does not have permission to '${action}' on '${resource}'`,
      },
      { status: 403 }
    );
  }

  return null;
}
