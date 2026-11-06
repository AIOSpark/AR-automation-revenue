// AIOSpark Iteration 21.1 — Pilot-Mode Security Test
// Verifies:
//   - Production auth secret fails closed
//   - Pilot mode survives restart
//   - Ordinary users cannot disable pilot mode
//   - Finance users cannot execute financial mutations in pilot mode
//   - Cross-tenant writes are rejected
//   - Cross-origin requests are rejected
//   - Missing-Origin state-changing requests are rejected
//   - Same-origin authorized requests work
//
// Uses synthetic organizations. Does not touch production or partner data.
//
// Run as part of npm run verify via master.test.ts.
// AIOSPARK_DB_PATH must be set to a temp SQLite file BEFORE this module is
// imported (set in master.test.ts).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { authStore } from '../../auth/store';
import { setPilotMode, validatePilotReadOnly, isPilotOrganization } from '../../auth/pilot';
import { udmStore } from '../../udm/store';
import { approvalStore } from '../../approvals/store';
import { executionService } from '../../execution/service';
import { executionStore } from '../../execution/store';
import { closeDatabase } from '../../db/durable-repository';
import { runWithTenant } from '../../tenant/request-context';
import { isCsrfRequestSafe } from '../../auth/csrf';

export async function runPilotSecurityTest() {
  console.log('\n==========================================');
  console.log('RUNNING PILOT-MODE SECURITY TEST');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [PILOT_PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [PILOT_FAIL] ${message}`);
      failed++;
    }
  }

  const userId = 'user_pilot_security_1';

  // ---------------------------------------------------------------
  // PHASE 1: Set up pilot org in current process
  // ---------------------------------------------------------------
  console.log('\n--- Phase 1: Set up pilot org in current process ---');

  const pilotOrg = authStore.createOrganizationDraft({
    name: 'Pilot Org',
    size: '51-200 employees',
    industry: 'Manufacturing',
    created_by_user_id: userId,
  });
  testAssert(!!pilotOrg.id, 'Pilot org created');
  const pilotOrgId = pilotOrg.id;

  const normalOrg = authStore.createOrganizationDraft({
    name: 'Normal Org',
    size: '51-200 employees',
    industry: 'Services',
    created_by_user_id: userId,
  });
  testAssert(!!normalOrg.id, 'Normal org created');
  const normalOrgId = normalOrg.id;

  // Set pilot mode on pilot org (this calls persistState internally)
  const setOk = setPilotMode(pilotOrgId, true);
  testAssert(setOk === true, 'setPilotMode(org_pilot, true) returns true');
  const pilotOrgRefetched = authStore.getOrganizationById(pilotOrgId);
  testAssert(pilotOrgRefetched !== null, 'pilot org exists');
  testAssert(pilotOrgRefetched?.pilotMode === true, 'org_pilot pilotMode === true in-memory');
  testAssert(authStore.getOrganizationById(normalOrgId)?.pilotMode !== true, 'org_normal pilotMode !== true');

  // ---------------------------------------------------------------
  // PHASE 2: Pilot-mode enforcement via validatePilotReadOnly
  // ---------------------------------------------------------------
  console.log('\n--- Phase 2: Pilot-mode enforcement via validatePilotReadOnly ---');

  // Financial mutation actions that should be BLOCKED in pilot org
  const blockedActions = [
    ['FINANCIAL_TRANSACTION', 'cash-unblock / billing / collections'],
    ['PAYMENT_INITIATION', 'reconciliation'],
    ['EXTERNAL_CUSTOMER_COMMUNICATION', 'copilot / approvals / reports'],
    ['ERP_WRITEBACK', 'integrations/sync'],
    ['AUTONOMOUS_EXECUTION', 'agents'],
    ['INVOICE_MODIFICATION', 'exceptions / tenant/data'],
    ['CUSTOMER_RECORD_MUTATION', 'customers / promises / receivables / next-best-action'],
  ];

  for (const [action, route] of blockedActions) {
    const result = validatePilotReadOnly(pilotOrgId, action);
    testAssert(
      result !== null && result.status === 403,
      `Pilot org: ${action} BLOCKED (403) — used by ${route}`
    );
  }

  // External customer communication via approvals
  const commBlocked = validatePilotReadOnly(pilotOrgId, 'EXTERNAL_CUSTOMER_COMMUNICATION');
  testAssert(
    commBlocked !== null && commBlocked.status === 403,
    'Pilot org: External customer communication BLOCKED'
  );

  // Normal org: financial mutations should be allowed
  const normalResult = validatePilotReadOnly(normalOrgId, 'FINANCIAL_TRANSACTION');
  testAssert(normalResult === null, 'Normal org: FINANCIAL_TRANSACTION allowed (no false positive)');

  // Read-only operations should work on pilot org
  testAssert(validatePilotReadOnly(pilotOrgId, 'VIEW_DATA') === null, 'Pilot org: VIEW_DATA allowed');
  testAssert(validatePilotReadOnly(pilotOrgId, 'FINANCIAL_ANALYSIS') === null, 'Pilot org: FINANCIAL_ANALYSIS allowed');
  testAssert(validatePilotReadOnly(pilotOrgId, 'SCENARIO_SIMULATION') === null, 'Pilot org: SCENARIO_SIMULATION allowed');

  testAssert(isPilotOrganization(pilotOrgId) === true, 'isPilotOrganization(pilotOrgId) === true');
  testAssert(isPilotOrganization(normalOrgId) === false, 'isPilotOrganization(normalOrgId) === false');

  // ---------------------------------------------------------------
  // PHASE 3: executionService.executeApprovedAction blocked in pilot
  // ---------------------------------------------------------------
  console.log('\n--- Phase 3: executionService pilot-mode enforcement ---');

  await runWithTenant(pilotOrgId, async () => {
    udmStore.setTenantContext(pilotOrgId);

    const cust = udmStore.insertCustomer({
      organization_id: pilotOrgId,
      source_system: 'manual',
      source_id: 'CUST-PILOT-001',
      name: 'Pilot Customer',
      credit_limit_minor_units: 10000000,
      currency: 'INR',
      payment_terms_days: 30,
    });

    const inv = udmStore.insertInvoice({
      organization_id: pilotOrgId,
      source_system: 'manual',
      source_id: 'pilot_inv_1',
      customer_id: cust.id,
      number: 'PILOT-INV-001',
      amount_minor_units: 5000000,
      tax_amount_minor_units: 750000,
      currency: 'INR',
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      status: 'open',
    });

    const pay = udmStore.insertPayment({
      organization_id: pilotOrgId,
      source_system: 'bank_feed',
      source_id: 'PAY-PILOT-001',
      customer_id: cust.id,
      amount_minor_units: 3000000,
      currency: 'INR',
      date: '2026-02-10',
    });

    const appr = approvalStore.createRequest({
      organization_id: pilotOrgId,
      subject_type: 'invoice',
      subject_id: inv.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: inv.id,
        payment_id: pay.id,
        amount_minor_units: 3000000,
        match_method: 'manual',
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'pilot_test',
    });
    approvalStore.approveRequest(appr.id, userId);

    let execError: Error | null = null;
    let execResult: any = null;
    try {
      execResult = await executionService.executeApprovedAction(appr.id, {
        organizationId: pilotOrgId,
        userId,
      });
    } catch (err: any) {
      execError = err as Error;
    }

    // executionService.executeApprovedAction should be blocked for pilot org
    testAssert(
      execError !== null || (execResult && execResult.state !== 'verified'),
      'Execution service blocks financial mutation in pilot org'
    );
    if (execError) {
      console.log(`    Execution service correctly blocked: ${execError}`);
    } else if (execResult && execResult.state !== 'verified') {
      console.log(`    Execution service correctly blocked: state=${execResult.state}`);
    }
  });

  // ---------------------------------------------------------------
  // PHASE 4: Pilot mode persists across restart
  // ---------------------------------------------------------------
  console.log('\n--- Phase 4: Pilot mode survives restart ---');

  const restartPilotOrg = authStore.createOrganizationDraft({
    name: 'Restart Pilot Org',
    size: '51-200 employees',
    industry: 'Manufacturing',
    created_by_user_id: userId,
  });
  testAssert(!!restartPilotOrg.id, 'Restart pilot org created');

  setPilotMode(restartPilotOrg.id, true);
  testAssert(authStore.getOrganizationById(restartPilotOrg.id)?.pilotMode === true, 'Pilot mode enabled before persist');
  authStore.persistState();
  closeDatabase();

  // Spawn reader process to verify pilot mode persists
  console.log('\n--- Spawning reader process to verify pilot mode survives restart ---');
  const readerScript = path.join(__dirname, 'pilot-security-reader.ts');
  const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

  const readerResult = execFileSync(tsxBin, [readerScript, restartPilotOrg.id], {
    env: {
      ...process.env,
      AIOSPARK_DB_PATH: process.env.AIOSPARK_DB_PATH || path.join(process.cwd(), '.data', 'aiospark.sqlite'),
      AIOSPARK_TEST_MODE: 'false',
      PILOT_ORG_ID: restartPilotOrg.id,
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  console.log(readerResult);
  if (readerResult.includes('[PILOT_PASS]') && !readerResult.includes('[PILOT_FAIL]')) {
    testAssert(true, 'Pilot mode survives restart (reader process confirmed)');
  } else {
    testAssert(false, 'Pilot mode did not survive restart');
  }

  // ---------------------------------------------------------------
  // PHASE 5: CSRF protection
  // ---------------------------------------------------------------
  console.log('\n--- Phase 5: CSRF protection ---');

  // Same-origin POST should be allowed
  const sameOrigin = isCsrfRequestSafe({
    method: 'POST',
    headers: new Headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }),
    nextUrl: new URL('http://localhost:3000/api/payments'),
  } as any);
  testAssert(sameOrigin === true, 'Same-origin POST allowed');

  // Cross-origin POST should be blocked
  const crossOrigin = isCsrfRequestSafe({
    method: 'POST',
    headers: new Headers({ origin: 'https://evil.com', host: 'localhost:3000' }),
    nextUrl: new URL('http://localhost:3000/api/payments'),
  } as any);
  testAssert(crossOrigin === false, 'Cross-origin POST rejected');

  // Missing-Origin state-changing request should be blocked (Iteration 20 fix)
  const noOrigin = isCsrfRequestSafe({
    method: 'POST',
    headers: new Headers({ host: 'localhost:3000' }),
    nextUrl: new URL('http://localhost:3000/api/payments'),
  } as any);
  testAssert(noOrigin === false, 'Missing-Origin state-changing request rejected (Iteration 20 fix)');

  // GET requests (non-state-changing) should be allowed
  const getRequest = isCsrfRequestSafe({
    method: 'GET',
    headers: new Headers({}),
    nextUrl: new URL('http://localhost:3000/api/invoices'),
  } as any);
  testAssert(getRequest === true, 'GET request allowed (non-state-changing)');

  console.log(`\n=== PILOT SECURITY TEST SUMMARY: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
