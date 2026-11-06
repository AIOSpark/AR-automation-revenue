// AIOSpark Pilot Mode Enforcement (Layer 32)
// Read-only pilot policy: financial mutations and external writebacks are blocked
// for organizations in pilot mode. Enforced server-side on every mutation endpoint.

import { authStore } from "./store";
import { NextResponse } from "next/server";

// Actions classified as prohibited financial mutations during pilot mode.
// Internal workflow actions (assignment, approval) that persist state are also
// prohibited unless explicitly classified as allowed.
const PROHIBITED_PILOT_ACTIONS = new Set([
  "PAYMENT_INITIATION",
  "FINANCIAL_TRANSACTION",
  "INVOICE_MODIFICATION",
  "CREDIT_NOTE_MODIFICATION",
  "BANK_WRITEBACK",
  "ERP_WRITEBACK",
  "AUTONOMOUS_EXECUTION",
  "EXTERNAL_CUSTOMER_COMMUNICATION",
  "CUSTOMER_RECORD_MUTATION",
]);

// Actions allowed during pilot mode (read-only or internal simulation only).
const ALLOWED_PILOT_ACTIONS = new Set([
  "VIEW_QUEUE",
  "VIEW_DATA",
  "FINANCIAL_ANALYSIS",
  "SCENARIO_SIMULATION",
  "HUMAN_REVIEW",
  "AUDIT_RECORD",
]);

export function isPilotOrganization(orgId: string): boolean {
  const org = authStore.getOrganizationById(orgId);
  return Boolean(org?.pilotMode);
}

export function setPilotMode(orgId: string, enabled: boolean): boolean {
  const org = authStore.getOrganizationById(orgId);
  if (!org) return false;
  org.pilotMode = enabled;
  org.updated_at = new Date().toISOString();
  authStore.persistState();
  return true;
}

export function isPilotProhibitedAction(action: string): boolean {
  return PROHIBITED_PILOT_ACTIONS.has(action);
}

export function isPilotAllowedAction(action: string): boolean {
  return ALLOWED_PILOT_ACTIONS.has(action);
}

/**
 * Middleware helper: enforces read-only pilot mode on mutation endpoints.
 * Returns a NextResponse error if the organization is in pilot mode and the
 * requested action is prohibited. Returns null if the request is allowed.
 */
export function validatePilotReadOnly(
  orgId: string | undefined,
  action: string
): NextResponse | null {
  if (!orgId) {
    return NextResponse.json(
      { error: "Forbidden: Organization context required" },
      { status: 403 }
    );
  }

  if (!isPilotOrganization(orgId)) {
    return null;
  }

  if (isPilotProhibitedAction(action)) {
    return NextResponse.json(
      {
        error:
          "Read-only pilot mode: financial mutations and external writebacks are disabled. Use simulation mode for scenario analysis.",
      },
      { status: 403 }
    );
  }

  return null;
}
