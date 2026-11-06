// AIOSpark Explicit Role-Based Access Control (RBAC) Permission Matrix

export type Role = "Owner" | "Admin" | "Finance Manager" | "Finance Executive" | "Viewer";

export type Resource =
  | "organization_settings"
  | "users_invites"
  | "customers"
  | "invoices"
  | "exceptions"
  | "approvals"
  | "integrations"
  | "billing";

export type Action = "view" | "create" | "edit" | "delete" | "approve" | "export";

// Explicit Permission Matrix (Role x Resource x Action -> boolean)
const PERMISSION_MATRIX: Record<Role, Partial<Record<Resource, Partial<Record<Action, boolean>>>>> = {
  Owner: {
    organization_settings: { view: true, create: true, edit: true, delete: true, approve: true },
    users_invites: { view: true, create: true, edit: true, delete: true, approve: true },
    customers: { view: true, create: true, edit: true, delete: true, approve: true },
    invoices: { view: true, create: true, edit: true, delete: true, approve: true, export: true },
    exceptions: { view: true, create: true, edit: true, delete: true, approve: true },
    approvals: { view: true, create: true, edit: true, delete: true, approve: true },
    integrations: { view: true, create: true, edit: true, delete: true, approve: true },
    billing: { view: true, create: true, edit: true, delete: true, approve: true },
  },
  Admin: {
    organization_settings: { view: true, create: true, edit: true, delete: false, approve: true },
    users_invites: { view: true, create: true, edit: true, delete: true, approve: true },
    customers: { view: true, create: true, edit: true, delete: true, approve: true },
    invoices: { view: true, create: true, edit: true, delete: true, approve: true, export: true },
    exceptions: { view: true, create: true, edit: true, delete: true, approve: true },
    approvals: { view: true, create: true, edit: true, delete: true, approve: true },
    integrations: { view: true, create: true, edit: true, delete: true, approve: true },
    billing: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  "Finance Manager": {
    organization_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    users_invites: { view: false, create: false, edit: false, delete: false, approve: false },
    customers: { view: true, create: true, edit: true, delete: false, approve: true },
    invoices: { view: true, create: true, edit: true, delete: false, approve: true, export: true },
    exceptions: { view: true, create: true, edit: true, delete: false, approve: true },
    approvals: { view: true, create: true, edit: true, delete: false, approve: true }, // Can approve!
    integrations: { view: false, create: false, edit: false, delete: false, approve: false },
    billing: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  "Finance Executive": {
    organization_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    users_invites: { view: false, create: false, edit: false, delete: false, approve: false },
    customers: { view: true, create: true, edit: true, delete: false, approve: false },
    invoices: { view: true, create: true, edit: true, delete: false, approve: false, export: false },
    exceptions: { view: true, create: true, edit: true, delete: false, approve: false },
    approvals: { view: true, create: false, edit: false, delete: false, approve: false }, // CANNOT approve!
    integrations: { view: false, create: false, edit: false, delete: false, approve: false },
    billing: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  Viewer: {
    organization_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    users_invites: { view: false, create: false, edit: false, delete: false, approve: false },
    customers: { view: true, create: false, edit: false, delete: false, approve: false },
    invoices: { view: true, create: false, edit: false, delete: false, approve: false, export: false },
    exceptions: { view: true, create: false, edit: false, delete: false, approve: false },
    approvals: { view: true, create: false, edit: false, delete: false, approve: false },
    integrations: { view: false, create: false, edit: false, delete: false, approve: false },
    billing: { view: false, create: false, edit: false, delete: false, approve: false },
  },
};

/**
 * Universal Permission Checking Utility
 * Evaluates Role x Resource x Action against the explicit data-driven Permission Matrix.
 */
export function can(role: Role | string, action: Action, resource: Resource): boolean {
  const validRole = role as Role;
  if (!PERMISSION_MATRIX[validRole]) {
    return false;
  }

  const resourcePermissions = PERMISSION_MATRIX[validRole][resource];
  if (!resourcePermissions) {
    return false;
  }

  return resourcePermissions[action] === true;
}

const ROLE_RANK: Record<Role, number> = {
  Owner: 5,
  Admin: 4,
  "Finance Manager": 3,
  "Finance Executive": 2,
  Viewer: 1,
};

export function canGrantRole(actorRole: Role | string, targetRole: Role | string): boolean {
  const actorRank = ROLE_RANK[actorRole as Role];
  const targetRank = ROLE_RANK[targetRole as Role];
  return Boolean(actorRank && targetRank && actorRank >= targetRank);
}

export function getRolePermissions(role: Role): Partial<Record<Resource, Partial<Record<Action, boolean>>>> {
  return PERMISSION_MATRIX[role] || {};
}
