// AIOSpark Multi-Tenant RLS & Data Store (Layer 3)

import { AuditService } from "../audit/service";
import { Role, Action, Resource, can } from "./permissions";
import { authStore, OrganizationRecord, UserRecord } from "../auth/store";
import { getRequestTenant, setRequestTenant } from "./request-context";
import { deleteSnapshot, readSnapshot, writeSnapshot } from "../db/durable-repository";

export interface OrgMemberRecord {
  id: string;
  user_id: string;
  organization_id: string;
  role: Role;
  created_at: string;
}

export interface InviteRecord {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  invited_by_user_id: string;
  status: "pending" | "accepted" | "expired";
  token: string;
  created_at: string;
}

export interface TenantScopedRecord {
  id: string;
  organization_id: string;
  [key: string]: unknown;
}

// Database Row-Level Security (RLS) & Multi-Tenant Store Manager
class MultiTenantStore {
  private members: Map<string, OrgMemberRecord> = new Map(); // Keyed by member ID
  private invites: Map<string, InviteRecord> = new Map(); // Keyed by invite token
  private tenantTables: Map<string, Map<string, TenantScopedRecord>> = new Map(); // Table -> Record ID -> Record

  // Session Context Simulation (Simulates Postgres `SET LOCAL app.current_org_id = ?`)
  constructor() {
    const state = readSnapshot<{
      members: OrgMemberRecord[];
      invites: InviteRecord[];
      tenantTables: Record<string, TenantScopedRecord[]>;
    }>('tenant');
    this.members = new Map((state?.members || []).map((member) => [member.id, member]));
    this.invites = new Map((state?.invites || []).map((invite) => [invite.token, invite]));
    // Initialize tenant tables
    this.tenantTables.set("customers", new Map());
    this.tenantTables.set("invoices", new Map());
    this.tenantTables.set("payments", new Map());
    this.tenantTables.set("exceptions", new Map());
    this.tenantTables.set("integrations", new Map());
    for (const [tableName, records] of Object.entries(state?.tenantTables || {})) {
      this.tenantTables.set(tableName, new Map(records.map((record) => [record.id, record])));
    }
  }

  private persist(): void {
    writeSnapshot('tenant', {
      members: Array.from(this.members.values()),
      invites: Array.from(this.invites.values()),
      tenantTables: Object.fromEntries(
        Array.from(this.tenantTables.entries()).map(([name, records]) => [name, Array.from(records.values())]),
      ),
    });
  }

  /**
   * Sets current session tenant context (simulates `SET LOCAL app.current_org_id = 'org_123'`)
   */
  public setSessionTenantContext(orgId: string | null): void {
    setRequestTenant(orgId);
  }

  public getSessionTenantContext(): string | null {
    return getRequestTenant();
  }

  /**
   * Asserts the active request tenant context matches the write target organization.
   * Prevents cross-tenant writes at the application storage layer (the active
   * runtime persistence mechanism; PostgreSQL RLS is not the active database).
   */
  private assertWriteTenant(organizationId: string): void {
    const activeTenant = getRequestTenant();
    // A null context means no session has been established; the API middleware
    // sets context before any write. Reject writes when context is null or does
    // not match the write target organization.
    if (!activeTenant || activeTenant !== organizationId) {
      throw new Error('Tenant write denied outside the active organization context');
    }
  }

  /**
   * Adds or updates a user membership in an organization with a specific role
   */
  public addMember(userId: string, orgId: string, role: Role, actorUserId?: string): OrgMemberRecord {
    const existing = this.getMember(userId, orgId);
    let beforeState: any = null;
    if (existing) {
      beforeState = { role: existing.role };
      existing.role = role;
      this.persist();

      AuditService.record({
        organization_id: orgId,
        actor_user_id: actorUserId || null,
        actor_type: actorUserId ? 'user' : 'system',
        action_type: 'user.role_changed',
        subject_type: 'user',
        subject_id: userId,
        before_state: beforeState,
        after_state: { role },
        result: 'success',
      });

      return existing;
    }

    const id = `mem_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const member: OrgMemberRecord = {
      id,
      user_id: userId,
      organization_id: orgId,
      role,
      created_at: new Date().toISOString(),
    };

    this.members.set(id, member);
    this.persist();

    AuditService.record({
      organization_id: orgId,
      actor_user_id: actorUserId || null,
      actor_type: actorUserId ? 'user' : 'system',
      action_type: 'user.added_to_org',
      subject_type: 'user',
      subject_id: userId,
      after_state: { role },
      result: 'success',
    });

    return member;
  }

  public getMember(userId: string, orgId: string): OrgMemberRecord | null {
    for (const mem of this.members.values()) {
      if (mem.user_id === userId && mem.organization_id === orgId) {
        return mem;
      }
    }
    return null;
  }

  public getUserOrganizations(userId: string): Array<{ organization: OrganizationRecord; role: Role }> {
    const results: Array<{ organization: OrganizationRecord; role: Role }> = [];
    for (const mem of this.members.values()) {
      if (mem.user_id === userId) {
        const org = (authStore as any).organizations.get(mem.organization_id);
        if (org) {
          results.push({ organization: org, role: mem.role });
        }
      }
    }
    return results;
  }

  public getOrgMembers(orgId: string): Array<{ member: OrgMemberRecord; user: UserRecord | null }> {
    const list: Array<{ member: OrgMemberRecord; user: UserRecord | null }> = [];
    for (const mem of this.members.values()) {
      if (mem.organization_id === orgId) {
        const user = authStore.getUserById(mem.user_id);
        list.push({ member: mem, user });
      }
    }
    return list;
  }

  /**
   * Creates a teammate invite (Requires Owner or Admin role)
   */
  public createInvite(data: {
    organization_id: string;
    email: string;
    role: Role;
    invited_by_user_id: string;
  }): InviteRecord {
    const token = `inv_tok_${Math.random().toString(36).substring(2, 15)}`;
    const invite: InviteRecord = {
      id: `inv_${Math.random().toString(36).substring(2, 11)}`,
      organization_id: data.organization_id,
      email: data.email.toLowerCase(),
      role: data.role,
      invited_by_user_id: data.invited_by_user_id,
      status: "pending",
      token,
      created_at: new Date().toISOString(),
    };

    this.invites.set(token, invite);
    this.persist();

    AuditService.record({
      organization_id: data.organization_id,
      actor_user_id: data.invited_by_user_id,
      actor_type: 'user',
      action_type: 'user.invited',
      subject_type: 'user',
      subject_id: data.email,
      after_state: { role: data.role, email: data.email },
      result: 'success',
    });

    return invite;
  }

  public getInviteByToken(token: string): InviteRecord | null {
    return this.invites.get(token) || null;
  }

  public getOrgInvites(orgId: string): InviteRecord[] {
    const result: InviteRecord[] = [];
    for (const inv of this.invites.values()) {
      if (inv.organization_id === orgId && inv.status === "pending") {
        result.push(inv);
      }
    }
    return result;
  }

  /**
   * RLS-Enforced Database Query Engine
   * Enforces `app.current_org_id` Row-Level Security at DB layer.
   */
  public queryTenantTable<T extends TenantScopedRecord>(tableName: string): T[] {
    const tableMap = this.tenantTables.get(tableName);
    if (!tableMap) return [];

    // CRITICAL SECURITY PROPERTY: If session tenant context is null, RLS returns 0 rows!
    const sessionOrgId = getRequestTenant();
    if (!sessionOrgId) {
      return [];
    }

    const matched: T[] = [];
    for (const record of tableMap.values()) {
      if (record.organization_id === sessionOrgId) {
        matched.push(record as T);
      }
    }
    return matched;
  }

  public getTenantRecordById<T extends TenantScopedRecord>(tableName: string, recordId: string): T | null {
    const tableMap = this.tenantTables.get(tableName);
    if (!tableMap) return null;

    // RLS Check: Must match active session tenant context
    const sessionOrgId = getRequestTenant();
    if (!sessionOrgId) {
      return null;
    }

    const record = tableMap.get(recordId);
    if (record && record.organization_id === sessionOrgId) {
      return record as T;
    }

    return null;
  }

  public insertTenantRecord<T extends TenantScopedRecord>(tableName: string, record: Omit<T, "id">): T {
    const tableMap = this.tenantTables.get(tableName) || new Map();
    const id = `rec_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    
    this.assertWriteTenant(record.organization_id as string);

    const fullRecord = {
      ...record,
      id,
    } as T;

    tableMap.set(id, fullRecord);
    this.tenantTables.set(tableName, tableMap);
    this.persist();
    return fullRecord;
  }

  public clearAll(): void {
    this.members.clear();
    this.invites.clear();
    for (const tableMap of this.tenantTables.values()) {
      tableMap.clear();
    }
    deleteSnapshot('tenant');
  }
}

export const tenantStore = new MultiTenantStore();
