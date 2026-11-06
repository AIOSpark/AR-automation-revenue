"use client";

import { Role, Action, Resource, can } from "@/lib/tenant/permissions";

interface CanProps {
  I: Action;
  a: Resource;
  role: Role | string | undefined;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Declarative Permission Gate Component
 * Evaluates `can(role, action, resource)` against the explicit Permission Matrix.
 */
export function Can({ I, a, role, children, fallback = null }: CanProps) {
  const effectiveRole = role ?? 'viewer';
  const isAllowed = can(effectiveRole, I, a);
  if (isAllowed) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
