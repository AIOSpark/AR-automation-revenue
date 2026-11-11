// HIGH-010R — Cross-namespace concurrency and audit-integrity verification.
// Runs real OS processes against one SQLite database.

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-high-010r-${process.pid}.sqlite`);
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';
process.env.AIOSPARK_SESSION_SECRET = 'test-high-010r-session-secret-0123456789abcdef';

const { authStore } = await import('../src/lib/auth/store.ts');
const { tenantStore } = await import('../src/lib/tenant/store.ts');
const { approvalStore } = await import('../src/lib/approvals/store.ts');
const { auditStore } = await import('../src/lib/audit/store.ts');
const { billingStore } = await import('../src/lib/billing/store.ts');
const { AuditService } = await import('../src/lib/audit/service.ts');
const { closeDatabase } = await import('../src/lib/db/durable-repository.ts');

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ [XNS_PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ❌ [XNS_FAIL] ${name}: ${error?.message || String(error)}`);
  }
}

function spawnWorker(env) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        './scripts/test-only-server-modules.mjs',
        '--import',
        'tsx',
        'scripts/cross-namespace-worker.ts',
      ],
      { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => {
      const lines = stdout.trim().split('\n').filter(Boolean);
      let result = null;
      try {
        result = JSON.parse(lines[lines.length - 1]);
      } catch {
        result = null;
      }
      resolve({ code, result, stdout, stderr });
    });
  });
}

async function main() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK HIGH-010R CROSS-NAMESPACE SUITE');
  console.log('==========================================\n');

  const orgA = authStore.createOrganizationDraft({
    name: 'Cross Namespace A',
    size: '11-50',
    industry: 'IT Services & SaaS',
    created_by_user_id: 'pending',
  });
  const owner = authStore.createUser({
    auth_provider_id: 'xns_owner',
    email: 'xns-owner@example.com',
    first_name: 'Cross',
    last_name: 'Owner',
    email_verified: true,
  });
  tenantStore.addMember(owner.id, orgA.id, 'Owner');

  const approval = approvalStore.createRequest({
    organization_id: orgA.id,
    subject_type: 'invoice',
    subject_id: 'inv_xns',
    action_type: 'OTHER_HIGH_RISK',
    proposed_action: { action: 'review_only' },
    evidence: [],
    confidence: 0.9,
    proposed_by: 'xns-test',
  });

  await check('Two processes: exactly one approval decision wins, the other gets HTTP 409', async () => {
    const startAt = Date.now() + 1500;
    const env = {
      XNS_ORG_ID: orgA.id,
      XNS_USER_ID: owner.id,
      XNS_APPROVAL_ID: approval.id,
      XNS_START_AT: String(startAt),
    };
    const [approve, reject] = await Promise.all([
      spawnWorker({ ...env, XNS_MODE: 'approval-decision', XNS_DECISION: 'approve' }),
      spawnWorker({ ...env, XNS_MODE: 'approval-decision', XNS_DECISION: 'reject' }),
    ]);

    assert.equal(approve.code, 0, approve.stderr);
    assert.equal(reject.code, 0, reject.stderr);
    assert(approve.result && reject.result, 'workers returned JSON results');
    const statuses = [approve.result.status, reject.result.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409], `expected [200,409], got ${JSON.stringify(statuses)}`);

    const conflict = approve.result.status === 409 ? approve.result : reject.result;
    assert.equal(conflict.body.code, 'APPROVAL_DECISION_CONFLICT');
  });

  await check('Only the winning decision appears in approval logs and audit history', async () => {
    const final = approvalStore.getRequest(approval.id);
    assert(final && ['approved', 'rejected'].includes(final.status));
    const logs = approvalStore.getLogs(approval.id);
    const decisions = logs.filter((entry) => entry.event_type === 'approved' || entry.event_type === 'rejected');
    assert.equal(decisions.length, 1, `expected one terminal log, got ${decisions.length}`);
    assert.equal(decisions[0].event_type, final.status);

    const audit = auditStore
      .query({ organizationId: orgA.id })
      .filter((record) => record.approval_context?.approval_request_id === approval.id)
      .filter((record) => record.action_type.endsWith('.approved') || record.action_type.endsWith('.rejected'));
    assert.equal(audit.length, 1, `expected one decision audit event, got ${audit.length}`);
    assert.equal(audit[0].approval_context?.status, final.status);
  });

  await check('Billing: concurrent versioned plan changes cannot silently overwrite', async () => {
    const initial = billingStore.setSubscription(
      orgA.id,
      { plan_id: 'growth' },
      { expectedVersion: 0 }
    );
    assert.equal(initial.version, 1);

    const startAt = Date.now() + 1500;
    const base = {
      XNS_MODE: 'billing-set',
      XNS_ORG_ID: orgA.id,
      XNS_START_AT: String(startAt),
      XNS_EXPECTED_VERSION: String(initial.version),
    };
    const [starter, enterprise] = await Promise.all([
      spawnWorker({ ...base, XNS_PLAN: 'starter' }),
      spawnWorker({ ...base, XNS_PLAN: 'enterprise' }),
    ]);

    assert.equal(starter.code, 0, starter.stderr);
    assert.equal(enterprise.code, 0, enterprise.stderr);
    const results = [starter.result, enterprise.result];
    const winners = results.filter((result) => result.ok);
    const conflicts = results.filter((result) => !result.ok);
    assert.equal(winners.length, 1, `expected one winner, got ${JSON.stringify(results)}`);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].code, 'BILLING_SUBSCRIPTION_CONFLICT');

    const final = billingStore.getSubscription(orgA.id);
    assert.equal(final.version, 2);
    assert.equal(final.plan_id, winners[0].plan);
  });

  await check('Audit failure rolls back a subscription update', async () => {
    const before = billingStore.getSubscription(orgA.id);
    const originalRecord = AuditService.record;
    AuditService.record = () => {
      throw new Error('injected billing audit failure');
    };
    try {
      assert.throws(
        () => billingStore.setSubscription(
          orgA.id,
          { plan_id: before.plan_id },
          { expectedVersion: before.version ?? 0 }
        ),
        /injected billing audit failure/
      );
    } finally {
      AuditService.record = originalRecord;
    }

    const after = billingStore.getSubscription(orgA.id);
    assert.equal(after.version, before.version);
    assert.equal(after.plan_id, before.plan_id);
  });

  await check('Audit failure rolls back the approval decision and leaves no decision audit event', async () => {
    const pending = approvalStore.createRequest({
      organization_id: orgA.id,
      subject_type: 'invoice',
      subject_id: 'inv_audit_failure',
      action_type: 'OTHER_HIGH_RISK',
      proposed_action: { action: 'review_only' },
      evidence: [],
      confidence: 0.9,
      proposed_by: 'xns-test',
    });

    const originalRecord = AuditService.record;
    AuditService.record = () => {
      throw new Error('injected audit persistence failure');
    };
    try {
      assert.throws(
        () => approvalStore.approveRequest(pending.id, owner.id),
        /injected audit persistence failure/
      );
    } finally {
      AuditService.record = originalRecord;
    }

    const afterFailure = approvalStore.getRequest(pending.id);
    assert.equal(afterFailure?.status, 'pending');
    const decisionLogs = approvalStore
      .getLogs(pending.id)
      .filter((entry) => entry.event_type === 'approved' || entry.event_type === 'rejected');
    assert.equal(decisionLogs.length, 0);

    const audit = auditStore
      .query({ organizationId: orgA.id })
      .filter((record) => record.approval_context?.approval_request_id === pending.id)
      .filter((record) => record.action_type.endsWith('.approved') || record.action_type.endsWith('.rejected'));
    assert.equal(audit.length, 0);

    // The rollback must leave the record usable.
    const approved = approvalStore.approveRequest(pending.id, owner.id);
    assert.equal(approved.status, 'approved');
  });

  console.log(`\nCROSS-NAMESPACE SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
  closeDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(`${DB}${suffix}`, { force: true });
    } catch {
      // Best-effort test cleanup.
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('🚨 Cross-namespace suite execution error:', error);
  process.exit(1);
});
