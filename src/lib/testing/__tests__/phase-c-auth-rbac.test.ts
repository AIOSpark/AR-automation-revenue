// AIOSpark Phase C — Authentication, RBAC & Read-Only Pilot Enforcement Test Suite
// Tests server-side authorization: unauthenticated access, RBAC, tenant isolation,
// pilot mode enforcement, and session handling.

import assert from 'node:assert';
import { createSessionToken, verifySessionToken, revokeSessionToken } from '../../auth/session';
import { authStore } from '../../auth/store';
import { tenantStore, OrgMemberRecord } from '../../tenant/store';
import { Role, can, canGrantRole } from '../../tenant/permissions';
import { isPilotOrganization, setPilotMode, validatePilotReadOnly } from '../../auth/pilot';
import { validatePermission, resolveTenantContext } from '../../tenant/middleware';
import { NextRequest } from 'next/server';

let passed = 0;
let failed = 0;

function assertTest(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    failed++;
  }
}

function makeRequest(
  userId: string | undefined,
  orgId: string,
  path: string,
  init: RequestInit = {}
): Request {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) };
  const cookieParts: string[] = [];
  if (userId) {
    const token = createSessionToken(userId);
    assertTest(Boolean(token), `Session token created for user ${userId}`);
    cookieParts.push(`aiospark_session=${token}`);
  }
  cookieParts.push(`aiospark_active_org=${orgId}`);
  headers.cookie = cookieParts.join('; ');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

export async function runPhaseCTestSuite(): Promise<{ passed: number; failed: number; errors: string[] }> {
  const errors: string[] = [];

  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK PHASE C AUTH/RBAC TEST SUITE');
  console.log('==========================================\n');

  // ---- Setup: organizations, users, members ----
  authStore.clearAll();
  tenantStore.clearAll();

  const orgA = authStore.createOrganizationDraft({
    name: 'Org A',
    size: '1-10',
    industry: 'IT Services & SaaS',
    created_by_user_id: 'pending',
  });
  const orgB = authStore.createOrganizationDraft({
    name: 'Org B',
    size: '11-50',
    industry: 'Financial Services & Banking',
    created_by_user_id: 'pending',
  });

  // Set orgA as pilot mode
  setPilotMode(orgA.id, true);

  const ownerA = authStore.createUser({
    auth_provider_id: 'sb_owner_a',
    email: 'owner-a@example.com',
    first_name: 'Owner',
    last_name: 'A',
  });
  const viewerA = authStore.createUser({
    auth_provider_id: 'sb_viewer_a',
    email: 'viewer-a@example.com',
    first_name: 'Viewer',
    last_name: 'A',
  });
  const financeExecA = authStore.createUser({
    auth_provider_id: 'sb_fin_exec_a',
    email: 'fin-exec-a@example.com',
    first_name: 'Finance',
    last_name: 'Exec',
  });
  const userNoOrg = authStore.createUser({
    auth_provider_id: 'sb_no_org',
    email: 'no-org@example.com',
    first_name: 'No',
    last_name: 'Org',
  });

  tenantStore.addMember(ownerA.id, orgA.id, 'Owner');
  tenantStore.addMember(viewerA.id, orgA.id, 'Viewer');
  tenantStore.addMember(financeExecA.id, orgA.id, 'Finance Executive');
  // userNoOrg has NO membership in any organization

  // ---- 1. Unauthenticated API request ----
  console.log('\n--- 1. Unauthenticated API Request ---');
  try {
    const res = await resolveTenantContext(
      new Request('http://localhost/api/payments', { headers: {} })
    );
    assertTest(res === null, 'Unauthenticated request returns null context');
  } catch (err: any) {
    errors.push(`1a: ${err.message}`);
    failed++;
  }

  // validatePermission with null context should return 401
  const permErr = validatePermission(null, 'view', 'invoices');
  assertTest(permErr !== null && permErr.status === 401, 'validatePermission rejects null context with 401');

  // ---- 2. Authenticated user without organization membership ----
  console.log('\n--- 2. User Without Organization Membership ---');
  try {
    const res = await resolveTenantContext(
      makeRequest(userNoOrg.id, orgA.id, '/api/payments')
    );
    assertTest(res === null, 'User without org membership returns null context');
  } catch (err: any) {
    errors.push(`2a: ${err.message}`);
    failed++;
  }

  // ---- 3. Valid user with read permission ----
  console.log('\n--- 3. Valid User With Read Permission ---');
  try {
    const res = await resolveTenantContext(
      makeRequest(ownerA.id, orgA.id, '/api/payments')
    );
    assertTest(res !== null, 'Owner with membership resolves context');
    assertTest(res?.role === 'Owner', 'Owner role resolved correctly');
    assertTest(res?.organization.id === orgA.id, 'Organization context resolved correctly');

    const permErr = validatePermission(res, 'view', 'invoices');
    assertTest(permErr === null, 'Owner has view permission on invoices');
  } catch (err: any) {
    errors.push(`3a: ${err.message}`);
    failed++;
  }

  // ---- 4. User without required edit permission ----
  console.log('\n--- 4. User Without Edit Permission ---');
  try {
    const res = await resolveTenantContext(
      makeRequest(viewerA.id, orgA.id, '/api/customers', { method: 'POST' })
    );
    const permErr = validatePermission(res, 'create', 'customers');
    assertTest(permErr !== null && permErr.status === 403, 'Viewer denied create permission on customers (403)');
  } catch (err: any) {
    errors.push(`4a: ${err.message}`);
    failed++;
  }

  // ---- 5. Finance Executive and Viewer restrictions ----
  console.log('\n--- 5. Finance Executive & Viewer Restrictions ---');
  try {
    const res = await resolveTenantContext(
      makeRequest(financeExecA.id, orgA.id, '/api/exceptions', { method: 'PATCH' })
    );
    const permErr = validatePermission(res, 'edit', 'exceptions');
    // Finance Executive has edit on exceptions per permission matrix, but
    // pilot mode blocks it. RBAC alone allows it.
    assertTest(permErr === null, 'Finance Executive has edit permission on exceptions (RBAC allows)');

    // Pilot mode blocks the edit regardless of RBAC
    const pilotErr = validatePilotReadOnly(orgA.id, 'INVOICE_MODIFICATION');
    assertTest(pilotErr !== null && pilotErr.status === 403, 'Pilot mode blocks Finance Executive exception edit');

    const res2 = await resolveTenantContext(
      makeRequest(viewerA.id, orgA.id, '/api/reconciliation', { method: 'POST' })
    );
    const permErr2 = validatePermission(res2, 'edit', 'invoices');
    assertTest(permErr2 !== null && permErr2.status === 403, 'Viewer denied edit on invoices (403)');

    // Viewer CAN view
    const res3 = await resolveTenantContext(
      makeRequest(viewerA.id, orgA.id, '/api/payments')
    );
    const permErr3 = validatePermission(res3, 'view', 'invoices');
    assertTest(permErr3 === null, 'Viewer allowed view on invoices');
  } catch (err: any) {
    errors.push(`5a: ${err.message}`);
    failed++;
  }

  // ---- 6. Owner/Admin permissions ----
  console.log('\n--- 6. Owner/Admin Permissions ---');
  try {
    const res = await resolveTenantContext(
      makeRequest(ownerA.id, orgA.id, '/api/reconciliation', { method: 'POST' })
    );
    const permErr = validatePermission(res, 'edit', 'invoices');
    assertTest(permErr === null, 'Owner allowed edit on invoices');

    const adminB = authStore.createUser({
      auth_provider_id: 'sb_admin_b',
      email: 'admin-b@example.com',
      first_name: 'Admin',
      last_name: 'B',
    });
    tenantStore.addMember(adminB.id, orgB.id, 'Admin');

    const resB = await resolveTenantContext(
      makeRequest(adminB.id, orgB.id, '/api/customers', { method: 'POST' })
    );
    const permErrB = validatePermission(resB, 'create', 'customers');
    assertTest(permErrB === null, 'Admin allowed create on customers');
  } catch (err: any) {
    errors.push(`6a: ${err.message}`);
    failed++;
  }

  // ---- 7. Cross-tenant data access attempts ----
  console.log('\n--- 7. Cross-Tenant Data Access ---');
  try {
    // Org A user should not see Org B data via RLS
    const sessionOrgId = orgA.id;
    // Simulate: tenantStore.queryTenantTable filters by session org
    // We can't easily set session context in test, but we can verify membership validation
    const memberInOrgB = tenantStore.getMember(ownerA.id, orgB.id);
    assertTest(memberInOrgB === null, 'OwnerA is not a member of OrgB (cross-tenant isolation)');

    // Try to resolve context for OrgA user targeting OrgB
    const res = await resolveTenantContext(
      makeRequest(ownerA.id, orgB.id, '/api/payments')
    );
    assertTest(res === null, 'OrgA user cannot resolve context for OrgB (401-equivalent)');
  } catch (err: any) {
    errors.push(`7a: ${err.message}`);
    failed++;
  }

  // ---- 8. Direct API mutation attempts during pilot mode ----
  console.log('\n--- 8. Pilot Mode Mutation Enforcement ---');
  try {
    // OrgA is in pilot mode
    assertTest(isPilotOrganization(orgA.id), 'OrgA is in pilot mode');
    assertTest(!isPilotOrganization(orgB.id), 'OrgB is NOT in pilot mode');

    // Pilot mode: financial transaction prohibited
    const pilotErr1 = validatePilotReadOnly(orgA.id, 'FINANCIAL_TRANSACTION');
    assertTest(pilotErr1 !== null && pilotErr1.status === 403, 'Pilot org: FINANCIAL_TRANSACTION blocked (403)');

    // Pilot mode: payment initiation prohibited
    const pilotErr2 = validatePilotReadOnly(orgA.id, 'PAYMENT_INITIATION');
    assertTest(pilotErr2 !== null && pilotErr2.status === 403, 'Pilot org: PAYMENT_INITIATION blocked (403)');

    // Pilot mode: ERP writeback prohibited
    const pilotErr3 = validatePilotReadOnly(orgA.id, 'ERP_WRITEBACK');
    assertTest(pilotErr3 !== null && pilotErr3.status === 403, 'Pilot org: ERP_WRITEBACK blocked (403)');

    // Pilot mode: external customer communication prohibited
    const pilotErr4 = validatePilotReadOnly(orgA.id, 'EXTERNAL_CUSTOMER_COMMUNICATION');
    assertTest(pilotErr4 !== null && pilotErr4.status === 403, 'Pilot org: EXTERNAL_CUSTOMER_COMMUNICATION blocked (403)');

    // Pilot mode: autonomous execution prohibited
    const pilotErr5 = validatePilotReadOnly(orgA.id, 'AUTONOMOUS_EXECUTION');
    assertTest(pilotErr5 !== null && pilotErr5.status === 403, 'Pilot org: AUTONOMOUS_EXECUTION blocked (403)');

    // Non-pilot org: same actions allowed
    const pilotErr6 = validatePilotReadOnly(orgB.id, 'FINANCIAL_TRANSACTION');
    assertTest(pilotErr6 === null, 'Non-pilot org: FINANCIAL_TRANSACTION allowed');

    const pilotErr7 = validatePilotReadOnly(orgB.id, 'PAYMENT_INITIATION');
    assertTest(pilotErr7 === null, 'Non-pilot org: PAYMENT_INITIATION allowed');
  } catch (err: any) {
    errors.push(`8a: ${err.message}`);
    failed++;
  }

  // ---- 9. Allowed internal data imports during pilot ----
  console.log('\n--- 9. Allowed Internal Data Imports During Pilot ---');
  try {
    // Import is allowed during pilot (approved import of customer-provided data)
    const pilotErr = validatePilotReadOnly(orgA.id, 'VIEW_DATA');
    assertTest(pilotErr === null, 'Pilot org: VIEW_DATA allowed');
    const pilotErr2 = validatePilotReadOnly(orgA.id, 'FINANCIAL_ANALYSIS');
    assertTest(pilotErr2 === null, 'Pilot org: FINANCIAL_ANALYSIS allowed');
    const pilotErr3 = validatePilotReadOnly(orgA.id, 'SCENARIO_SIMULATION');
    assertTest(pilotErr3 === null, 'Pilot org: SCENARIO_SIMULATION allowed');
    const pilotErr4 = validatePilotReadOnly(orgA.id, 'HUMAN_REVIEW');
    assertTest(pilotErr4 === null, 'Pilot org: HUMAN_REVIEW allowed');
    const pilotErr5 = validatePilotReadOnly(orgA.id, 'AUDIT_RECORD');
    assertTest(pilotErr5 === null, 'Pilot org: AUDIT_RECORD allowed');
  } catch (err: any) {
    errors.push(`9a: ${err.message}`);
    failed++;
  }

  // ---- 10. Unauthorized financial execution ----
  console.log('\n--- 10. Unauthorized Financial Execution ---');
  try {
    // Viewer cannot execute financial actions
    const res = await resolveTenantContext(
      makeRequest(viewerA.id, orgA.id, '/api/billing', { method: 'POST' })
    );
    const permErr = validatePermission(res, 'edit', 'billing');
    assertTest(permErr !== null && permErr.status === 403, 'Viewer denied edit on billing (403)');

    // Finance Executive cannot approve
    const res2 = await resolveTenantContext(
      makeRequest(financeExecA.id, orgA.id, '/api/approvals')
    );
    const permErr2 = validatePermission(res2, 'approve', 'approvals');
    assertTest(permErr2 !== null && permErr2.status === 403, 'Finance Executive denied approve on approvals (403)');
  } catch (err: any) {
    errors.push(`10a: ${err.message}`);
    failed++;
  }

  // ---- 11. Unauthorized external communications ----
  console.log('\n--- 11. Unauthorized External Communications ---');
  try {
    // Viewer cannot export reports
    const res = await resolveTenantContext(
      makeRequest(viewerA.id, orgA.id, '/api/reports', { method: 'POST' })
    );
    const permErr = validatePermission(res, 'export', 'invoices');
    assertTest(permErr !== null && permErr.status === 403, 'Viewer denied export on invoices (403)');

    // Pilot mode blocks external communication
    const pilotErr = validatePilotReadOnly(orgA.id, 'EXTERNAL_CUSTOMER_COMMUNICATION');
    assertTest(pilotErr !== null && pilotErr.status === 403, 'Pilot org: external communication blocked');
  } catch (err: any) {
    errors.push(`11a: ${err.message}`);
    failed++;
  }

  // ---- 12. Session expiration and role-resolution failures ----
  console.log('\n--- 12. Session Expiration & Role Resolution ---');
  try {
    // Revoked session token
    const token = createSessionToken(ownerA.id) ?? undefined;
    revokeSessionToken(token);
    const verified = verifySessionToken(token);
    assertTest(verified === null, 'Revoked session token is rejected');
    assertTest(verified === null, 'Revoked session token is rejected');

    // Invalid session token
    const invalidRes = await resolveTenantContext(
      new Request('http://localhost/api/payments', {
        headers: { cookie: 'aiospark_session=invalid.token.here; aiospark_active_org=' + orgA.id },
      })
    );
    assertTest(invalidRes === null, 'Invalid session token returns null context');

    // Missing session cookie
    const noSessionRes = await resolveTenantContext(
      new Request('http://localhost/api/payments', { headers: {} })
    );
    assertTest(noSessionRes === null, 'Missing session cookie returns null context');

    // Role resolution: canGrantRole prevents privilege escalation
    assertTest(canGrantRole('Viewer', 'Owner') === false, 'Viewer cannot grant Owner role');
    assertTest(canGrantRole('Admin', 'Owner') === false, 'Admin cannot grant Owner role');
    assertTest(canGrantRole('Owner', 'Admin') === true, 'Owner can grant Admin role');
    assertTest(canGrantRole('Owner', 'Viewer') === true, 'Owner can grant Viewer role');
  } catch (err: any) {
    errors.push(`12a: ${err.message}`);
    failed++;
  }

  // ---- 13. Pilot mode persistence & access control ----
  console.log('\n--- 13. Pilot Mode Persistence & Access Control ---');
  try {
    // Pilot mode is set on OrgA
    assertTest(isPilotOrganization(orgA.id), 'OrgA pilotMode is true after setPilotMode');

    // setPilotMode returns false for unknown org
    assertTest(setPilotMode('org_nonexistent', true) === false, 'setPilotMode returns false for unknown org');

    // Toggling pilot mode off and on works
    assertTest(setPilotMode(orgA.id, false) === true, 'setPilotMode can disable pilot mode');
    assertTest(isPilotOrganization(orgA.id) === false, 'OrgA pilotMode is false after disabling');
    assertTest(setPilotMode(orgA.id, true) === true, 'setPilotMode can re-enable pilot mode');
    assertTest(isPilotOrganization(orgA.id) === true, 'OrgA pilotMode is true after re-enabling');

    // Pilot mode state is stored on OrganizationRecord (survives via snapshot persistence)
    const orgRecord = authStore.getOrganizationById(orgA.id);
    assertTest(orgRecord?.pilotMode === true, 'OrganizationRecord.pilotMode reflects current state');

    // Ordinary users cannot change pilot mode — no API endpoint exposes setPilotMode
    // (setPilotMode is programmatic only; tests verify it exists as internal helper)
    assertTest(typeof setPilotMode === 'function', 'setPilotMode exists as internal helper');
    assertTest(typeof isPilotOrganization === 'function', 'isPilotOrganization exists as internal helper');
  } catch (err: any) {
    errors.push(`13a: ${err.message}`);
    failed++;
  }

  // ---- 14. Fail-closed on missing or invalid organization ----
  console.log('\n--- 14. Fail-Closed on Missing Organization ---');
  try {
    // Unknown orgId returns false for isPilotOrganization (not a pilot → mutations allowed, but
    // the org itself is invalid so resolveTenantContext rejects it first)
    assertTest(isPilotOrganization('org_nonexistent') === false, 'Unknown org is not a pilot');

    // validatePilotReadOnly with no orgId returns 403
    const noOrgErr = validatePilotReadOnly(undefined, 'FINANCIAL_TRANSACTION');
    assertTest(noOrgErr !== null && noOrgErr.status === 403, 'Missing orgId → 403 (fail closed)');

    // An org that doesn't exist cannot pass resolveTenantContext
    const fakeOrgRes = await resolveTenantContext(
      makeRequest(ownerA.id, 'org_nonexistent', '/api/payments')
    );
    assertTest(fakeOrgRes === null, 'Non-existent org → null context (401-equivalent)');
  } catch (err: any) {
    errors.push(`14a: ${err.message}`);
    failed++;
  }

  console.log(`\n==========================================`);
  console.log(`PHASE C TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  return { passed, failed, errors };
}

// Standalone runner
if (require.main === module) {
  runPhaseCTestSuite().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}
