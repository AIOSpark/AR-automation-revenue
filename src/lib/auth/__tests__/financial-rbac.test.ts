// AIOSpark HIGH-011 — Financial RBAC route-level verification.
// Exercises the actual Next.js route handlers, not just the permission matrix.

import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { createSessionToken } from '../session';
import { authStore } from '../store';
import { tenantStore } from '../../tenant/store';
import { Role, can } from '../../tenant/permissions';
import { approvalStore } from '../../approvals/store';
import { GET as paymentsGET } from '../../../app/api/payments/route';
import { GET as reconciliationGET, POST as reconciliationPOST } from '../../../app/api/reconciliation/route';
import { GET as collectionsGET, POST as collectionsPOST } from '../../../app/api/collections/route';
import { GET as cashUnblockGET, POST as cashUnblockPOST } from '../../../app/api/cash-unblock/route';
import { GET as exceptionsGET, PATCH as exceptionsPATCH } from '../../../app/api/exceptions/route';
import { POST as approvalsPOST } from '../../../app/api/approvals/[id]/route';
import { POST as customersPOST } from '../../../app/api/customers/route';
import { POST as promisesPOST } from '../../../app/api/promises/route';
import { POST as importPOST } from '../../../app/api/onboarding/import/route';
import { POST as copilotActionPOST } from '../../../app/api/copilot/action/route';
import { POST as integrationSyncPOST } from '../../../app/api/integrations/sync/route';
import { GET as platformRevenueGET } from '../../../app/api/admin/revenue/route';

interface SuiteResult {
  passed: number;
  failed: number;
  errors: string[];
}

function request(
  userId: string,
  orgId: string,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): NextRequest {
  const token = createSessionToken(userId);
  assert(token, `session token created for ${userId}`);
  const headers: Record<string, string> = {
    cookie: `aiospark_session=${token}; aiospark_active_org=${orgId}`,
    ...(options.headers || {}),
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export async function runFinancialRbacSuite(): Promise<SuiteResult> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  async function check(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      passed++;
      console.log(`  ✅ [FIN_RBAC_PASS] ${name}`);
    } catch (error: any) {
      failed++;
      errors.push(`${name}: ${error?.message || String(error)}`);
      console.error(`  ❌ [FIN_RBAC_FAIL] ${name}: ${error?.message || String(error)}`);
    }
  }

  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK HIGH-011 FINANCIAL RBAC SUITE');
  console.log('==========================================\n');

  const orgA = authStore.createOrganizationDraft({
    name: 'Financial RBAC Org A',
    size: '11-50',
    industry: 'IT Services & SaaS',
    created_by_user_id: 'pending',
  });
  const orgB = authStore.createOrganizationDraft({
    name: 'Financial RBAC Org B',
    size: '11-50',
    industry: 'Financial Services & Banking',
    created_by_user_id: 'pending',
  });

  const users: Record<string, { id: string; role: Role }> = {};
  for (const role of ['Owner', 'Admin', 'Finance Manager', 'Finance Executive', 'Viewer'] as Role[]) {
    const user = authStore.createUser({
      auth_provider_id: `rbac_${role.toLowerCase().replace(/\s+/g, '_')}`,
      email: `${role.toLowerCase().replace(/\s+/g, '-')}@rbac.example.com`,
      first_name: role,
      last_name: 'User',
      email_verified: true,
    });
    tenantStore.addMember(user.id, orgA.id, role);
    users[role] = { id: user.id, role };
  }

  const outsider = authStore.createUser({
    auth_provider_id: 'rbac_outsider',
    email: 'outsider@rbac.example.com',
    first_name: 'Out',
    last_name: 'Sider',
    email_verified: true,
  });
  tenantStore.addMember(outsider.id, orgB.id, 'Owner');

  // ----------------------------------------------------------------
  // Matrix: positive and negative coverage for every role.
  // ----------------------------------------------------------------
  await check('Viewer can read all financial workspaces but cannot mutate them', () => {
    for (const resource of ['payments', 'credit_notes', 'reconciliation', 'collections', 'cash_unblock'] as const) {
      assert.equal(can('Viewer', 'view', resource), true, `Viewer should view ${resource}`);
      assert.equal(can('Viewer', 'create', resource), false, `Viewer should not create ${resource}`);
      assert.equal(can('Viewer', 'edit', resource), false, `Viewer should not edit ${resource}`);
    }
    assert.equal(can('Viewer', 'approve', 'payments'), false);
    assert.equal(can('Viewer', 'execute', 'reconciliation'), false);
    assert.equal(can('Viewer', 'reverse', 'credit_notes'), false);
  });

  await check('Finance Executive can prepare but cannot approve or execute financial actions', () => {
    assert.equal(can('Finance Executive', 'create', 'payments'), true);
    assert.equal(can('Finance Executive', 'edit', 'reconciliation'), true);
    assert.equal(can('Finance Executive', 'create', 'collections'), true);
    assert.equal(can('Finance Executive', 'approve', 'payments'), false);
    assert.equal(can('Finance Executive', 'approve', 'reconciliation'), false);
    assert.equal(can('Finance Executive', 'execute', 'reconciliation'), false);
    assert.equal(can('Finance Executive', 'execute', 'cash_unblock'), false);
    assert.equal(can('Finance Executive', 'create', 'credit_notes'), false);
    assert.equal(can('Finance Executive', 'reverse', 'credit_notes'), false);
  });

  await check('Finance Manager has operational authority but no billing control', () => {
    assert.equal(can('Finance Manager', 'approve', 'payments'), true);
    assert.equal(can('Finance Manager', 'execute', 'reconciliation'), true);
    assert.equal(can('Finance Manager', 'create', 'credit_notes'), true);
    assert.equal(can('Finance Manager', 'reverse', 'credit_notes'), true);
    assert.equal(can('Finance Manager', 'view', 'billing'), false);
  });

  await check('Owner and Admin have full financial authority; only Owner controls billing', () => {
    for (const role of ['Owner', 'Admin'] as const) {
      assert.equal(can(role, 'approve', 'credit_notes'), true);
      assert.equal(can(role, 'execute', 'reconciliation'), true);
      assert.equal(can(role, 'execute', 'cash_unblock'), true);
    }
    assert.equal(can('Owner', 'edit', 'billing'), true);
    assert.equal(can('Admin', 'edit', 'billing'), false);
  });

  // ----------------------------------------------------------------
  // Route-level denial: every financial mutation rejects a Viewer.
  // ----------------------------------------------------------------
  await check('Viewer receives 403 on reconciliation mutation', async () => {
    const res = await reconciliationPOST(request(users.Viewer.id, orgA.id, '/api/reconciliation', {
      method: 'POST',
      body: { action: 'run_reconciliation' },
    }));
    assert.equal(res.status, 403);
  });

  await check('Viewer receives 403 on collection mutation', async () => {
    const res = await collectionsPOST(request(users.Viewer.id, orgA.id, '/api/collections', {
      method: 'POST',
      body: { invoiceId: 'inv_any' },
    }));
    assert.equal(res.status, 403);
  });

  await check('Viewer receives 403 on cash-unblock mutation', async () => {
    const res = await cashUnblockPOST(request(users.Viewer.id, orgA.id, '/api/cash-unblock', {
      method: 'POST',
      body: { actionType: 'ASSIGN_OWNER' },
    }));
    assert.equal(res.status, 403);
  });

  await check('Viewer receives 403 on exception mutation', async () => {
    const res = await exceptionsPATCH(request(users.Viewer.id, orgA.id, '/api/exceptions', {
      method: 'PATCH',
      body: { exceptionId: 'exc_any', toStatus: 'closed' },
    }));
    assert.equal(res.status, 403);
  });

  await check('Viewer and Finance Executive receive 403 on approval execution', async () => {
    const viewerRes = await approvalsPOST(
      request(users.Viewer.id, orgA.id, '/api/approvals/appr_any', {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { params: Promise.resolve({ id: 'appr_any' }) }
    );
    assert.equal(viewerRes.status, 403);

    const execRes = await approvalsPOST(
      request(users['Finance Executive'].id, orgA.id, '/api/approvals/appr_any', {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { params: Promise.resolve({ id: 'appr_any' }) }
    );
    assert.equal(execRes.status, 403);
  });

  await check('Finance Executive receives 403 when attempting reconciliation execution', async () => {
    const res = await reconciliationPOST(request(users['Finance Executive'].id, orgA.id, '/api/reconciliation', {
      method: 'POST',
      body: { action: 'run_reconciliation' },
    }));
    assert.equal(res.status, 403);
  });

  await check('Finance Executive receives 403 on terminal exception decision', async () => {
    const res = await exceptionsPATCH(request(users['Finance Executive'].id, orgA.id, '/api/exceptions', {
      method: 'PATCH',
      body: { exceptionId: 'exc_any', toStatus: 'approved' },
    }));
    assert.equal(res.status, 403);
  });

  await check('Finance Executive receives 403 when attempting cash-unblock execution', async () => {
    const res = await cashUnblockPOST(request(users['Finance Executive'].id, orgA.id, '/api/cash-unblock', {
      method: 'POST',
      body: { actionType: 'EXECUTE_ACTION' },
    }));
    assert.equal(res.status, 403);
  });

  await check('Viewer receives 403 on customer, promise, import, copilot and integration mutations', async () => {
    const customerRes = await customersPOST(request(users.Viewer.id, orgA.id, '/api/customers', {
      method: 'POST',
      body: { name: 'Blocked Customer' },
    }));
    assert.equal(customerRes.status, 403);

    const promiseRes = await promisesPOST(request(users.Viewer.id, orgA.id, '/api/promises', {
      method: 'POST',
      body: {},
    }));
    assert.equal(promiseRes.status, 403);

    const importRes = await importPOST(request(users.Viewer.id, orgA.id, '/api/onboarding/import', {
      method: 'POST',
      body: { rows: [] },
    }));
    assert.equal(importRes.status, 410);

    const copilotRes = await copilotActionPOST(request(users.Viewer.id, orgA.id, '/api/copilot/action', {
      method: 'POST',
      body: { actionType: 'DRAFT_EMAIL', payload: {} },
    }));
    assert.equal(copilotRes.status, 403);

    const integrationRes = await integrationSyncPOST(request(users.Viewer.id, orgA.id, '/api/integrations/sync', {
      method: 'POST',
      body: { adapterType: 'tally' },
    }));
    assert.equal(integrationRes.status, 403);
  });

  // ----------------------------------------------------------------
  // Authorized reads pass.
  // ----------------------------------------------------------------
  await check('Owner can read all financial workspaces', async () => {
    const owner = users.Owner.id;
    const responses = await Promise.all([
      paymentsGET(request(owner, orgA.id, '/api/payments')),
      reconciliationGET(request(owner, orgA.id, '/api/reconciliation')),
      collectionsGET(request(owner, orgA.id, '/api/collections')),
      cashUnblockGET(request(owner, orgA.id, '/api/cash-unblock')),
      exceptionsGET(request(owner, orgA.id, '/api/exceptions')),
    ]);
    for (const res of responses) assert.equal(res.status, 200);
  });

  await check('Viewer is allowed to read financial workspaces', async () => {
    const viewer = users.Viewer.id;
    const responses = await Promise.all([
      paymentsGET(request(viewer, orgA.id, '/api/payments')),
      reconciliationGET(request(viewer, orgA.id, '/api/reconciliation')),
      collectionsGET(request(viewer, orgA.id, '/api/collections')),
      cashUnblockGET(request(viewer, orgA.id, '/api/cash-unblock')),
    ]);
    for (const res of responses) assert.equal(res.status, 200);
  });

  await check('Authorized Owner passes the reconciliation permission gate', async () => {
    const res = await reconciliationPOST(request(users.Owner.id, orgA.id, '/api/reconciliation', {
      method: 'POST',
      body: { action: 'unsupported' },
    }));
    assert.notEqual(res.status, 403);
    assert.equal(res.status, 400);
  });

  // ----------------------------------------------------------------
  // Resource ownership and tenant isolation.
  // ----------------------------------------------------------------
  await check('Cross-tenant organization header is rejected', async () => {
    const res = await paymentsGET(request(users.Owner.id, orgA.id, '/api/payments', {
      headers: { 'x-organization-id': orgB.id },
    }));
    assert.equal(res.status, 401);
  });

  await check('Approval from another tenant is not readable or actionable', async () => {
    const foreign = approvalStore.createRequest({
      organization_id: orgB.id,
      subject_type: 'invoice',
      subject_id: 'inv_foreign',
      action_type: 'ALTER_INVOICE_VALUE',
      proposed_action: { action: 'correct_invoice_tax_schedule', invoice_id: 'inv_foreign' },
      evidence: [],
      confidence: 0.9,
      proposed_by: 'test',
    });

    const res = await approvalsPOST(
      request(users.Owner.id, orgA.id, `/api/approvals/${foreign.id}`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { params: Promise.resolve({ id: foreign.id }) }
    );
    assert.equal(res.status, 404);
  });

  await check('Unauthenticated request is rejected with 401', async () => {
    const res = await paymentsGET(new Request('http://localhost/api/payments'));
    assert.equal(res.status, 401);
  });

  // ----------------------------------------------------------------
  // Platform privileges are separate from organization roles.
  // ----------------------------------------------------------------
  await check('Organization Owner cannot access platform revenue administration', async () => {
    const res = await platformRevenueGET(request(users.Owner.id, orgA.id, '/api/admin/revenue'));
    assert.equal(res.status, 403);
  });

  await check('Dedicated platform administrator access is independent of org role', async () => {
    authStore.setPlatformAdmin(users.Viewer.id, true);
    try {
      const res = await platformRevenueGET(request(users.Viewer.id, orgA.id, '/api/admin/revenue'));
      assert.equal(res.status, 200);
    } finally {
      authStore.setPlatformAdmin(users.Viewer.id, false);
    }
  });

  console.log(`\nFINANCIAL RBAC SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
  return { passed, failed, errors };
}
