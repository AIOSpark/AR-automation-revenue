# AIOSpark Multi-Tenant Organization System & RBAC (Layer 3)

## Architectural Overview & Security Isolation Model

AIOSpark implements a **Shared Database with Postgres Row-Level Security (RLS)** as its multi-tenant isolation strategy. Every tenant table has a required, indexed `organization_id` foreign key.

Enforcement occurs at the database layer via RLS policies—application-level `WHERE organization_id = ?` filtering is NEVER relied upon as the sole defense.

---

## Postgres Row-Level Security (RLS) Implementation

### Session Context Injection (`app.current_org_id`)
On every request, the application middleware resolves the authenticated user's active organization ID and injects it into the Postgres session configuration:

```sql
SET LOCAL app.current_org_id = 'org_uuid_here';
```

### Database RLS Policy Template
All tenant-scoped tables (`customers`, `invoices`, `payments`, `disputes`, `exceptions`, `integrations`, `agents`) enforce the following policy:

```sql
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON public.invoices
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );
```

If a query is executed without setting `app.current_org_id`, `current_setting('app.current_org_id', true)` evaluates to `NULL`, causing RLS to return **zero rows**, preventing cross-customer data leakage even in the event of application bugs.

---

## Role-Based Access Control (RBAC) Permission Matrix

AIOSpark uses an explicit, data-driven Permission Matrix modeled in `src/lib/tenant/permissions.ts`.

### Roles Hierarchy (Most to Least Privileged)
1. **Owner**: Full system access, billing, user management, and organization deletion.
2. **Admin**: Full operational access except billing and organization deletion.
3. **Finance Manager**: Full view/create/edit on financial ledgers and approval authority. Cannot manage users/integrations.
4. **Finance Executive**: View/create/edit on financial ledgers. Cannot approve actions or manage settings.
5. **Viewer**: Read-only view on financial ledgers. Zero write/create/delete access.

### Explicit Role × Resource × Action Matrix

| Resource | Action | Owner | Admin | Finance Manager | Finance Executive | Viewer |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `organization_settings` | view | ✅ | ✅ | ❌ | ❌ | ❌ |
| `organization_settings` | edit | ✅ | ✅ | ❌ | ❌ | ❌ |
| `organization_settings` | delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| `users_invites` | view / create / edit | ✅ | ✅ | ❌ | ❌ | ❌ |
| `customers` | view / create / edit | ✅ | ✅ | ✅ | ✅ | view only |
| `invoices` | view / create / edit | ✅ | ✅ | ✅ | ✅ | view only |
| `exceptions` | view / edit | ✅ | ✅ | ✅ | ✅ | view only |
| `approvals` | approve | ✅ | ✅ | ✅ | ❌ | ❌ |
| `integrations` | view / edit | ✅ | ✅ | ❌ | ❌ | ❌ |
| `billing` | view / edit | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Multi-Tenant Organization Switcher

Users can belong to multiple organizations (e.g., fractional CFOs or enterprise consultants). The active organization context is stored in an `aiospark_active_org` session cookie, switchable seamlessly via the UI Organization Switcher component ([OrgSwitcher.tsx](file:///home/subham/AIOSpark/AR-automation-revenue/src/components/tenant/OrgSwitcher.tsx)).

---

## Cross-Tenant Penetration Test Suite

Automated security verification is enforced in `src/lib/tenant/__tests__/cross-tenant-pen.test.ts` and wired into CI (`npm run test:tenant`):

1. **Cross-Tenant ID Fetch**: Org A user requesting Org B record ID -> Blocked.
2. **Cross-Tenant List Pollution**: Org A user listing records -> 0 Org B records returned.
3. **Viewer Role Write Block**: Viewer attempting write/edit/delete -> Blocked.
4. **Finance Executive Approval Block**: Executive attempting action approval -> Blocked.
5. **Raw DB Bypass Protection**: Direct query without tenant session context -> Blocked by RLS.

---

## Enterprise Sales Positioning

In enterprise procurement reviews (SOC 2, ISO 27001, vendor security assessments), AIOSpark's multi-tenancy architecture provides:
- **Hard Database-Level Isolation**: Data boundary enforced by Postgres kernel, not application code.
- **Audit-Gated RBAC**: Explicit role matrix preventing privilege escalation.
- **Multi-Entity Capability**: Native support for parent-subsidiary enterprise structures.
