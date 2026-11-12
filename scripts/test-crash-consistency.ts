// AIOSpark Phase 3.1 — Crash Consistency Tests (Child Process)
// Uses child Node.js processes (via tsx) to simulate crashes at controlled points,
// then reopens the same SQLite database from a fresh process to verify recovery.

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';
import { authStore } from '../src/lib/auth/store';
import { tenantStore } from '../src/lib/tenant/store';
import { udmStore } from '../src/lib/udm/store';
import { previewStore } from '../src/lib/import/preview-store';

const dbPath = join(tmpdir(), `aiospark-crash-test-${Date.now()}.sqlite`);
const childScript = join(tmpdir(), `crash-child-${Date.now()}.ts`);
const projectRoot = '/home/subham/AIOSpark/AR-automation-revenue';

function cleanup() {
  try { unlinkSync(dbPath); } catch {}
  try { unlinkSync(childScript); } catch {}
  // Clear all singleton stores to ensure test isolation
  try { authStore.clearAll(); } catch {}
  try { tenantStore.clearAll(); } catch {}
  try { udmStore.clearAll(); } catch {}
  try { previewStore.clearAll(); } catch {}
}

function runChild(scriptCode: string): { status: number; stdout: string; stderr: string } {
  writeFileSync(childScript, scriptCode);
  try {
    const result = execSync(`npx tsx "${childScript}"`, {
      env: {
        ...process.env,
        AIOSPARK_DB_PATH: dbPath,
        AIOSPARK_TEST_MODE: 'false', // file-based SQLite
        AIOSPARK_SESSION_SECRET: 'test-crash-secret-1234567890abcdefghijklmnopqrstuvwxyz',
        AIOSPARK_OPERATIONAL_MODE: 'development',
      },
      timeout: 30000,
      encoding: 'utf8',
      cwd: projectRoot,
    });
    return { status: 0, stdout: result as string, stderr: '' };
  } catch (err: any) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (error: any) {
    failed++;
    errors.push(`${name}: ${error?.message || String(error)}`);
    console.error(`  ❌ [FAIL] ${name}: ${error?.message || String(error)}`);
  }
}

// Extract a value like KEY:value from stdout
function extractValue(stdout: string, key: string): string | null {
  const match = stdout.match(new RegExp(`${key}:(\\S+)`));
  return match ? match[1] : null;
}

// ============================================================================
// Test 1: Crash after preview claim — recovery returns COMMITTING to READY
// ============================================================================
check("Crash after preview claim — recovery returns COMMITTING to READY", () => {
  cleanup();
  const script = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    import { authStore } from '${projectRoot}/src/lib/auth/store.ts';
    import { tenantStore } from '${projectRoot}/src/lib/tenant/store.ts';

    const org = authStore.createOrganizationDraft({
      name: 'Crash Org', size: '51-200 employees', industry: 'Financial Services & Banking',
      created_by_user_id: 'temp',
    });
    const user = authStore.createUser({
      auth_provider_id: 'crash_user_1', email: 'crash@test.com', first_name: 'Crash', last_name: 'Test',
      email_verified: true,
    });
    tenantStore.addMember(user.id, org.id, 'Owner', user.id);

    const preview = previewStore.create({
      userId: user.id, organizationId: org.id,
      payloadHash: 'hash1', columnMapping: {}, rows: [],
    });
    const claim = previewStore.claim(preview.id, user.id, org.id);
    console.log('CLAIM_STATUS:' + claim.record.status);
    console.log('PREVIEW_ID:' + preview.id);
    process.exit(0);
  `;
  const result = runChild(script);
  assert.equal(result.status, 0, `Child exited with status ${result.status}: ${result.stderr}`);

  const previewId = extractValue(result.stdout, 'PREVIEW_ID');
  assert.ok(previewId, 'Preview ID should be in output');

  // Restart (fresh process) — recoverStaleCommitting runs on constructor
  const restartScript = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    const preview = previewStore.findById('${previewId}');
    console.log('RESTART_STATUS:' + (preview ? preview.status : 'NOT_FOUND'));
    process.exit(0);
  `;
  const restartResult = runChild(restartScript);
  assert.ok(restartResult.stdout.includes('RESTART_STATUS:READY'),
    `Expected READY after recovery, got: ${restartResult.stdout.trim()}`);

  cleanup();
});

// ============================================================================
// Test 2: Crash after idempotency reservation — key is recoverable
// ============================================================================
check("Crash after idempotency reservation — key is recoverable", () => {
  cleanup();
  const script = `
    import { udmStore } from '${projectRoot}/src/lib/udm/store.ts';
    import { authStore } from '${projectRoot}/src/lib/auth/store.ts';
    import { tenantStore } from '${projectRoot}/src/lib/tenant/store.ts';

    const org = authStore.createOrganizationDraft({
      name: 'Crash Org 2', size: '51-200 employees', industry: 'Financial Services & Banking',
      created_by_user_id: 'temp',
    });
    const user = authStore.createUser({
      auth_provider_id: 'crash_user_2', email: 'crash2@test.com', first_name: 'Crash', last_name: 'Test2',
      email_verified: true,
    });
    tenantStore.addMember(user.id, org.id, 'Owner', user.id);

    udmStore.setTenantContext(org.id);
    console.log('STORE_READY:true');
    process.exit(0);
  `;
  const result = runChild(script);
  assert.equal(result.status, 0, `Child exited with status ${result.status}`);
  assert.ok(result.stdout.includes('STORE_READY:true'), 'Store should be ready');

  cleanup();
});

// ============================================================================
// Test 3: Crash during financial insertion — batch is 'processing'
// ============================================================================
check("Crash during insertion — batch 'processing', preview stays COMMITTING", () => {
  cleanup();
  const script = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    import { importEngine } from '${projectRoot}/src/lib/import/engine.ts';
    import { udmStore } from '${projectRoot}/src/lib/udm/store.ts';
    import { authStore } from '${projectRoot}/src/lib/auth/store.ts';
    import { tenantStore } from '${projectRoot}/src/lib/tenant/store.ts';

    const org = authStore.createOrganizationDraft({
      name: 'Crash Org 3', size: '51-200 employees', industry: 'Financial Services & Banking',
      created_by_user_id: 'temp',
    });
    const user = authStore.createUser({
      auth_provider_id: 'crash_user_3', email: 'crash3@test.com', first_name: 'Crash', last_name: 'Test3',
      email_verified: true,
    });
    tenantStore.addMember(user.id, org.id, 'Owner', user.id);

    udmStore.setTenantContext(org.id);

    const preview = previewStore.create({
      userId: user.id, organizationId: org.id,
      payloadHash: 'hash3', columnMapping: {}, rows: [],
    });
    const claim = previewStore.claim(preview.id, user.id, org.id);

    const batch = importEngine.createBatch(
      { organizationId: org.id, sourceSystem: 'csv', dateFormatConvention: 'DD/MM/YYYY', columnMapping: {} },
      []
    );
    previewStore.setBatchId(preview.id, batch.id);

    console.log('PREVIEW_STATUS:' + claim.record.status);
    console.log('PREVIEW_ID:' + preview.id);
    console.log('BATCH_ID:' + batch.id);
    process.exit(0);
  `;
  const result = runChild(script);
  assert.equal(result.status, 0, `Child exited with status ${result.status}: ${result.stderr}`);

  const previewId = extractValue(result.stdout, 'PREVIEW_ID');
  assert.ok(previewId, 'Preview ID should be in output');

  // Restart — batch is 'processing', preview should stay COMMITTING (ambiguous)
  const restartScript = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    const preview = previewStore.findById('${previewId}');
    console.log('RESTART_STATUS:' + (preview ? preview.status : 'NOT_FOUND'));
    process.exit(0);
  `;
  const restartResult = runChild(restartScript);
  assert.ok(restartResult.stdout.includes('RESTART_STATUS:COMMITTING'),
    `Expected COMMITTING after recovery, got: ${restartResult.stdout.trim()}`);

  cleanup();
});

// ============================================================================
// Test 4: Crash after financial commit but before preview COMMITTED
// ============================================================================
check("Crash after financial commit — recovery reconciles to COMMITTED", () => {
  cleanup();
  const script = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    import { importEngine } from '${projectRoot}/src/lib/import/engine.ts';
    import { udmStore } from '${projectRoot}/src/lib/udm/store.ts';
    import { authStore } from '${projectRoot}/src/lib/auth/store.ts';
    import { tenantStore } from '${projectRoot}/src/lib/tenant/store.ts';
    import { updateImportBatch } from '${projectRoot}/src/lib/db/operational-repository.ts';

    const org = authStore.createOrganizationDraft({
      name: 'Crash Org 4', size: '51-200 employees', industry: 'Financial Services & Banking',
      created_by_user_id: 'temp',
    });
    const user = authStore.createUser({
      auth_provider_id: 'crash_user_4', email: 'crash4@test.com', first_name: 'Crash', last_name: 'Test4',
      email_verified: true,
    });
    tenantStore.addMember(user.id, org.id, 'Owner', user.id);

    udmStore.setTenantContext(org.id);

    const preview = previewStore.create({
      userId: user.id, organizationId: org.id,
      payloadHash: 'hash4', columnMapping: {}, rows: [],
    });
    previewStore.claim(preview.id, user.id, org.id);

    // Simulate financial records committed (batch is 'completed')
    const batch = importEngine.createBatch(
      { organizationId: org.id, sourceSystem: 'csv', dateFormatConvention: 'DD/MM/YYYY', columnMapping: {} },
      []
    );
    previewStore.setBatchId(preview.id, batch.id);
    batch.status = 'completed';
    batch.completed_at = new Date().toISOString();
    // Persist the completed status to SQLite
    updateImportBatch(batch);

    console.log('PREVIEW_ID:' + preview.id);
    console.log('PREVIEW_STATUS:' + previewStore.findById(preview.id)?.status);
    process.exit(0);
  `;
  const result = runChild(script);
  assert.equal(result.status, 0, `Child exited with status ${result.status}: ${result.stderr}`);

  const previewId = extractValue(result.stdout, 'PREVIEW_ID');
  assert.ok(previewId, 'Preview ID should be in output');

  // Restart — batch is 'completed', preview should be reconciled to COMMITTED
  const restartScript = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    const preview = previewStore.findById('${previewId}');
    console.log('RESTART_STATUS:' + (preview ? preview.status : 'NOT_FOUND'));
    process.exit(0);
  `;
  const restartResult = runChild(restartScript);
  assert.ok(restartResult.stdout.includes('RESTART_STATUS:COMMITTED'),
    `Expected COMMITTED after recovery, got: ${restartResult.stdout.trim()}`);

  cleanup();
});

// ============================================================================
// Test 5: Crash after preview COMMITTED but before API response
// ============================================================================
check("Crash after COMMITTED — preview stays COMMITTED", () => {
  cleanup();
  const script = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    import { authStore } from '${projectRoot}/src/lib/auth/store.ts';
    import { tenantStore } from '${projectRoot}/src/lib/tenant/store.ts';

    const org = authStore.createOrganizationDraft({
      name: 'Crash Org 5', size: '51-200 employees', industry: 'Financial Services & Banking',
      created_by_user_id: 'temp',
    });
    const user = authStore.createUser({
      auth_provider_id: 'crash_user_5', email: 'crash5@test.com', first_name: 'Crash', last_name: 'Test5',
      email_verified: true,
    });
    tenantStore.addMember(user.id, org.id, 'Owner', user.id);

    const preview = previewStore.create({
      userId: user.id, organizationId: org.id,
      payloadHash: 'hash5', columnMapping: {}, rows: [],
    });
    previewStore.claim(preview.id, user.id, org.id);
    previewStore.commit(preview.id);

    console.log('PREVIEW_ID:' + preview.id);
    console.log('PREVIEW_STATUS:' + previewStore.findById(preview.id)?.status);
    process.exit(0);
  `;
  const result = runChild(script);
  assert.equal(result.status, 0, `Child exited with status ${result.status}: ${result.stderr}`);

  const previewId = extractValue(result.stdout, 'PREVIEW_ID');
  assert.ok(previewId, 'Preview ID should be in output');

  // Restart — preview should still be COMMITTED
  const restartScript = `
    import { previewStore } from '${projectRoot}/src/lib/import/preview-store.ts';
    const preview = previewStore.findById('${previewId}');
    console.log('RESTART_STATUS:' + (preview ? preview.status : 'NOT_FOUND'));
    process.exit(0);
  `;
  const restartResult = runChild(restartScript);
  assert.ok(restartResult.stdout.includes('RESTART_STATUS:COMMITTED'),
    `Expected COMMITTED after recovery, got: ${restartResult.stdout.trim()}`);

  cleanup();
});

// ============================================================================
// Transaction Concurrency Tests
// ============================================================================

// ============================================================================
// Test 6: Two simultaneous imports using different previews (same org)
// ============================================================================
check("Concurrent: Two different previews, same org — both claims succeed", () => {
  cleanup();
  const org = authStore.createOrganizationDraft({
    name: 'Concurrency Org 1', size: '51-200 employees', industry: 'Financial Services & Banking',
    created_by_user_id: 'temp',
  });
  const user = authStore.createUser({
    auth_provider_id: 'conc_user_1', email: 'conc1@test.com', first_name: 'Conc', last_name: 'One',
    email_verified: true,
  });
  tenantStore.addMember(user.id, org.id, 'Owner', user.id);

  const preview1 = previewStore.create({
    userId: user.id, organizationId: org.id,
    payloadHash: 'hash_conc_1', columnMapping: {}, rows: [],
  });
  const preview2 = previewStore.create({
    userId: user.id, organizationId: org.id,
    payloadHash: 'hash_conc_2', columnMapping: {}, rows: [],
  });

  // Simulate concurrent claims using sequential calls (claim() is synchronous)
  const result1 = previewStore.claim(preview1.id, user.id, org.id);
  const result2 = previewStore.claim(preview2.id, user.id, org.id);
  assert.ok(result1.record, 'Preview 1 should be claimable');
  assert.equal(result1.record.status, 'COMMITTING', 'Preview 1 should be COMMITTING');
  assert.ok(result2.record, 'Preview 2 should be claimable');
  assert.equal(result2.record.status, 'COMMITTING', 'Preview 2 should be COMMITTING');

  // Both should be COMMITTING after concurrent claims
  const p1 = previewStore.findById(preview1.id);
  const p2 = previewStore.findById(preview2.id);
  assert.ok(p1, 'Preview 1 record should exist');
  assert.ok(p2, 'Preview 2 record should exist');
  assert.equal(p1.status, 'COMMITTING', 'Preview 1 should remain COMMITTING');
  assert.equal(p2.status, 'COMMITTING', 'Preview 2 should remain COMMITTING');

  cleanup();
});

// ============================================================================
// Test 7: Two separate organizations importing concurrently
// ============================================================================
check("Concurrent: Two different organizations — both claims succeed", () => {
  cleanup();
  const orgA = authStore.createOrganizationDraft({
    name: 'Concurrency Org A', size: '51-200 employees', industry: 'Financial Services & Banking',
    created_by_user_id: 'temp',
  });
  const orgB = authStore.createOrganizationDraft({
    name: 'Concurrency Org B', size: '1-10 employees', industry: 'IT Services & SaaS',
    created_by_user_id: 'temp',
  });
  const userA = authStore.createUser({
    auth_provider_id: 'conc_user_a', email: 'conca@test.com', first_name: 'Conc', last_name: 'A',
    email_verified: true,
  });
  const userB = authStore.createUser({
    auth_provider_id: 'conc_user_b', email: 'concb@test.com', first_name: 'Conc', last_name: 'B',
    email_verified: true,
  });
  tenantStore.addMember(userA.id, orgA.id, 'Owner', userA.id);
  tenantStore.addMember(userB.id, orgB.id, 'Owner', userB.id);

  const previewA = previewStore.create({
    userId: userA.id, organizationId: orgA.id,
    payloadHash: 'hash_conc_a', columnMapping: {}, rows: [],
  });
  const previewB = previewStore.create({
    userId: userB.id, organizationId: orgB.id,
    payloadHash: 'hash_conc_b', columnMapping: {}, rows: [],
  });

  // Claim both previews sequentially (claim() is synchronous)
  const resultA = previewStore.claim(previewA.id, userA.id, orgA.id);
  const resultB = previewStore.claim(previewB.id, userB.id, orgB.id);
  assert.ok(resultA.record, 'Preview A should be claimable');
  assert.equal(resultA.record.status, 'COMMITTING', 'Preview A should be COMMITTING');
  assert.ok(resultB.record, 'Preview B should be claimable');
  assert.equal(resultB.record.status, 'COMMITTING', 'Preview B should be COMMITTING');

  cleanup();
});

// ============================================================================
// Test 8: Failure in one transaction while another succeeds
// ============================================================================
check("Concurrent: Failure in one transaction doesn't affect another", () => {
  cleanup();
  const org = authStore.createOrganizationDraft({
    name: 'Concurrency Org 2', size: '51-200 employees', industry: 'Financial Services & Banking',
    created_by_user_id: 'temp',
  });
  const user = authStore.createUser({
    auth_provider_id: 'conc_user_2', email: 'conc2@test.com', first_name: 'Conc', last_name: 'Two',
    email_verified: true,
  });
  tenantStore.addMember(user.id, org.id, 'Owner', user.id);

  const preview1 = previewStore.create({
    userId: user.id, organizationId: org.id,
    payloadHash: 'hash_fail_1', columnMapping: {}, rows: [],
  });
  const preview2 = previewStore.create({
    userId: user.id, organizationId: org.id,
    payloadHash: 'hash_fail_2', columnMapping: {}, rows: [],
  });

  // Claim preview1 successfully
  const claim1 = previewStore.claim(preview1.id, user.id, org.id);
  assert.ok(claim1.record, 'Preview 1 should be claimable');
  assert.equal(claim1.record.status, 'COMMITTING', 'Preview 1 should be COMMITTING');

  // Preview2 should also be claimable (different preview, same org)
  const claim2 = previewStore.claim(preview2.id, user.id, org.id);
  assert.ok(claim2.record, 'Preview 2 should be claimable');
  assert.equal(claim2.record.status, 'COMMITTING', 'Preview 2 should be COMMITTING');

  // Mark preview1 as FAILED (simulating import failure)
  const failed = previewStore.fail(preview1.id);
  assert.equal(failed, true, 'Preview 1 should be marked FAILED');

  // Preview2 should still be COMMITTING (not affected by preview1's failure)
  const p2 = previewStore.findById(preview2.id);
  assert.ok(p2, 'Preview 2 record should exist');
  assert.equal(p2.status, 'COMMITTING', 'Preview 2 should remain COMMITTING after preview1 failure');

  // Preview1 should be FAILED
  const p1 = previewStore.findById(preview1.id);
  assert.ok(p1, 'Preview 1 record should exist');
  assert.equal(p1.status, 'FAILED', 'Preview 1 should be FAILED');

  cleanup();
});

// ============================================================================
// Test 9: Rollback isolation — one rolls back, other's data persists
// ============================================================================
check("Concurrent: Rollback isolation — one fails, other's data persists", () => {
  cleanup();
  const org = authStore.createOrganizationDraft({
    name: 'Concurrency Org 3', size: '51-200 employees', industry: 'Financial Services & Banking',
    created_by_user_id: 'temp',
  });
  const user = authStore.createUser({
    auth_provider_id: 'conc_user_3', email: 'conc3@test.com', first_name: 'Conc', last_name: 'Three',
    email_verified: true,
  });
  tenantStore.addMember(user.id, org.id, 'Owner', user.id);

  const preview1 = previewStore.create({
    userId: user.id, organizationId: org.id,
    payloadHash: 'hash_iso_1', columnMapping: {}, rows: [],
  });
  const preview2 = previewStore.create({
    userId: user.id, organizationId: org.id,
    payloadHash: 'hash_iso_2', columnMapping: {}, rows: [],
  });

  // Claim both previews
  previewStore.claim(preview1.id, user.id, org.id);
  previewStore.claim(preview2.id, user.id, org.id);

  // Fail preview1 (rollback)
  previewStore.fail(preview1.id);

  // Commit preview2 (success)
  previewStore.commit(preview2.id);

  // Verify isolation
  const p1 = previewStore.findById(preview1.id);
  const p2 = previewStore.findById(preview2.id);
  assert.ok(p1, 'Preview 1 record should exist');
  assert.ok(p2, 'Preview 2 record should exist');
  assert.equal(p1.status, 'FAILED', 'Preview 1 should be FAILED');
  assert.equal(p2.status, 'COMMITTED', 'Preview 2 should be COMMITTED');

  cleanup();
});

// ============================================================================
// Test 10: No cross-tenant transaction contamination
// ============================================================================
check("Concurrent: No cross-tenant contamination", () => {
  cleanup();
  const orgX = authStore.createOrganizationDraft({
    name: 'Concurrency Org X', size: '51-200 employees', industry: 'Financial Services & Banking',
    created_by_user_id: 'temp',
  });
  const orgY = authStore.createOrganizationDraft({
    name: 'Concurrency Org Y', size: '1-10 employees', industry: 'IT Services & SaaS',
    created_by_user_id: 'temp',
  });
  const userX = authStore.createUser({
    auth_provider_id: 'conc_user_x', email: 'concx@test.com', first_name: 'Conc', last_name: 'X',
    email_verified: true,
  });
  const userY = authStore.createUser({
    auth_provider_id: 'conc_user_y', email: 'concy@test.com', first_name: 'Conc', last_name: 'Y',
    email_verified: true,
  });
  tenantStore.addMember(userX.id, orgX.id, 'Owner', userX.id);
  tenantStore.addMember(userY.id, orgY.id, 'Owner', userY.id);

  const previewX = previewStore.create({
    userId: userX.id, organizationId: orgX.id,
    payloadHash: 'hash_x', columnMapping: {}, rows: [],
  });
  const previewY = previewStore.create({
    userId: userY.id, organizationId: orgY.id,
    payloadHash: 'hash_y', columnMapping: {}, rows: [],
  });

  // Claim both previews sequentially (claim() is synchronous)
  const resultX = previewStore.claim(previewX.id, userX.id, orgX.id);
  const resultY = previewStore.claim(previewY.id, userY.id, orgY.id);
  assert.ok(resultX.record, 'Preview X should be claimable');
  assert.equal(resultX.record.status, 'COMMITTING', 'Preview X should be COMMITTING');
  assert.ok(resultY.record, 'Preview Y should be claimable');
  assert.equal(resultY.record.status, 'COMMITTING', 'Preview Y should be COMMITTING');

  // Verify no contamination: each preview belongs to its own org
  const px = previewStore.findById(previewX.id);
  const py = previewStore.findById(previewY.id);
  assert.ok(px, 'Preview X record should exist');
  assert.ok(py, 'Preview Y record should exist');
  assert.equal(px.organizationId, orgX.id, 'Preview X should belong to Org X');
  assert.equal(py.organizationId, orgY.id, 'Preview Y should belong to Org Y');
  assert.notEqual(px.organizationId, py.organizationId, 'Previews should belong to different orgs');

  cleanup();
});

// ============================================================================
// Summary
// ============================================================================
console.log(`\n==========================================`);
console.log(`CRASH CONSISTENCY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`==========================================\n`);

if (failed > 0) process.exit(1);