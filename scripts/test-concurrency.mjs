/**
 * AIOSpark HIGH-009 / HIGH-010 acceptance suite: durable, cross-process
 * financial persistence.
 *
 * Every worker below is a separate OS process using the same SQLite file, so
 * the assertions cannot be satisfied by process-local Maps, mutexes, or a
 * single connection. Run with:
 *
 *   node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/test-concurrency.mjs
 */
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = `/tmp/aiospark-concurrency-${process.pid}.sqlite`;
const ORG_A = 'org_concurrency_a';
const ORG_B = 'org_concurrency_b';

process.env.AIOSPARK_DB_PATH = DB_PATH;
process.env.AIOSPARK_TEST_MODE = 'false';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ [CONCURRENCY_PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [CONCURRENCY_FAIL] ${message}`);
    failed++;
  }
}

function cleanupDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${DB_PATH}${suffix}`);
    } catch {
      // File may not exist.
    }
  }
}

function runWorker(mode, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--import', './scripts/test-only-server-modules.mjs', '--import', 'tsx', 'scripts/concurrency-worker.ts'],
      {
        cwd: process.cwd(),
        env: { ...process.env, WORKER_MODE: mode, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => {
      let result = null;
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          result = JSON.parse(lines[i]);
          break;
        } catch {
          // Ignore non-JSON loader output.
        }
      }
      if (code !== 0 && !result?.ok) {
        console.error(`[worker:${mode}] exit=${code} signal=${signal}\n${stderr || stdout}`);
      }
      resolve({ code, signal, stdout, stderr, result });
    });
  });
}

function workerEnv(orgId, extra = {}) {
  return { WORKER_ORG: orgId, ...extra };
}

const { udmStore } = await import('../src/lib/udm/store.ts');
const { runWithTenant } = await import('../src/lib/tenant/request-context.ts');
const { closeDatabase, getDurableStatePath, getSchemaVersion, readSnapshotDirect } = await import('../src/lib/db/durable-repository.ts');
check(getDurableStatePath() === DB_PATH, `Repository opened the expected file (${getDurableStatePath()})`);

// DB_PATH is unique per process, so no pre-open cleanup is needed. Deleting
// the file after the parent connection opens it would leave SQLite writing to
// an unlinked inode while workers create a fresh empty database.

console.log('\n==========================================');
console.log('CROSS-PROCESS DURABILITY & CONCURRENCY TEST');
console.log('==========================================');
console.log(`DB_PATH=${DB_PATH}\n`);

const customerA = await runWithTenant(ORG_A, () => {
  udmStore.setTenantContext(ORG_A);
  return udmStore.insertCustomer({
    organization_id: ORG_A,
    source_system: 'manual',
    source_id: 'cust_concurrency_a',
    name: 'Concurrency Org A',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });
});

const customerB = await runWithTenant(ORG_B, () => {
  udmStore.setTenantContext(ORG_B);
  return udmStore.insertCustomer({
    organization_id: ORG_B,
    source_system: 'manual',
    source_id: 'cust_concurrency_b',
    name: 'Concurrency Org B',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });
});

check(getSchemaVersion() === 4, `Repository schema version recorded (${getSchemaVersion()})`);
const parentSnapshot = readSnapshotDirect('udm');
check(parentSnapshot !== null, 'Durable SQLite snapshot exists before concurrent workers');
check(parentSnapshot?.customers?.length === 2, 'Both seeded customers are in the parent snapshot');

const preflight = await runWorker('read-counts', workerEnv(ORG_A));
console.log('[preflight]', JSON.stringify(preflight.result));
check(preflight.result?.counts?.customers === 1, 'A fresh process sees the seeded customer');
check(preflight.result?.dbPath === DB_PATH, 'Fresh process opened the same SQLite file');

// ---------------------------------------------------------------------------
// 1. Concurrent identical idempotency keys must create exactly one invoice.
// ---------------------------------------------------------------------------
const SAME_KEY = 'idem_cross_process_invoice_001';
const sameKeyResults = await Promise.all(
  Array.from({ length: 8 }, () => runWorker('idempotent-invoice', workerEnv(ORG_A, {
    WORKER_CUSTOMER_ID: customerA.id,
    WORKER_IDEMPOTENCY_KEY: SAME_KEY,
    WORKER_INVOICE_NUMBER: 'INV-CONCURRENT-SAME',
  }))),
);
const sameKeyIds = sameKeyResults.map((result) => result.result?.id).filter(Boolean);
check(sameKeyResults.every((result) => result.code === 0 && result.result?.ok), 'All idempotent workers exited successfully');
check(sameKeyIds.length === 8 && new Set(sameKeyIds).size === 1,
  `8 processes, same idempotency key → one invoice id (${new Set(sameKeyIds).size} distinct)`);

const orgAInvoices = await runWithTenant(ORG_A, () => {
  udmStore.setTenantContext(ORG_A);
  return udmStore.getInvoices();
});
check(orgAInvoices.filter((invoice) => invoice.idempotency_key === SAME_KEY).length === 1,
  'Exactly one invoice row exists for the shared idempotency key');

// ---------------------------------------------------------------------------
// 2. Same key in a different tenant must be independent, never leaked.
// ---------------------------------------------------------------------------
const otherTenant = await runWorker('idempotent-invoice', workerEnv(ORG_B, {
  WORKER_CUSTOMER_ID: customerB.id,
  WORKER_IDEMPOTENCY_KEY: SAME_KEY,
  WORKER_INVOICE_NUMBER: 'INV-CONCURRENT-SAME',
}));
check(otherTenant.code === 0 && otherTenant.result?.ok, 'Cross-tenant worker exited successfully');
check(otherTenant.result?.id && otherTenant.result.id !== sameKeyIds[0],
  'Same key under another tenant creates a separate record');
const orgBInvoices = await runWithTenant(ORG_B, () => {
  udmStore.setTenantContext(ORG_B);
  return udmStore.getInvoices();
});
check(orgBInvoices.length === 1 && orgBInvoices[0].organization_id === ORG_B,
  'Tenant B sees only its own invoice');

// ---------------------------------------------------------------------------
// 3. Concurrent matches against one invoice must not lose updates.
// ---------------------------------------------------------------------------
const sharedInvoice = await runWithTenant(ORG_A, () => {
  udmStore.setTenantContext(ORG_A);
  return udmStore.insertInvoice({
    organization_id: ORG_A,
    source_system: 'manual',
    source_id: 'src_inv_shared_concurrency',
    customer_id: customerA.id,
    number: 'INV-CONCURRENT-SHARED',
    amount_minor_units: 1000000,
    currency: 'INR',
    tax_amount_minor_units: 180000,
    issue_date: '2026-10-01',
    due_date: '2026-10-31',
    status: 'open',
  });
});

const matchResults = await Promise.all(
  Array.from({ length: 8 }, () => runWorker('add-match', workerEnv(ORG_A, {
    WORKER_CUSTOMER_ID: customerA.id,
    WORKER_INVOICE_ID: sharedInvoice.id,
    WORKER_AMOUNT: '100000',
  }))),
);
check(matchResults.every((result) => result.code === 0 && result.result?.ok), 'All concurrent match workers succeeded');

const matchState = await runWithTenant(ORG_A, () => {
  udmStore.setTenantContext(ORG_A);
  return {
    matches: udmStore.getMatches().filter((match) => match.invoice_id === sharedInvoice.id),
    payments: udmStore.getPayments(),
  };
});
check(matchState.matches.length === 8,
  `All 8 concurrent matches persisted (got ${matchState.matches.length})`);
check(matchState.matches.reduce((sum, match) => sum + match.matched_amount_minor_units, 0) === 800000,
  'Matched amount sum is preserved without lost updates');
check(matchState.payments.length === 8, `All 8 concurrent payments persisted (got ${matchState.payments.length})`);
check(matchState.matches.every((match) => match.organization_id === ORG_A),
  'Every concurrently written match belongs to the active tenant');

// ---------------------------------------------------------------------------
// 4. Crash mid-mutation must leave no partial committed state.
// ---------------------------------------------------------------------------
const beforeCrash = await runWithTenant(ORG_A, () => {
  udmStore.setTenantContext(ORG_A);
  return { payments: udmStore.getPayments().length, matches: udmStore.getMatches().length };
});
const crashMarker = path.join('/tmp', `aiospark-crash-marker-${process.pid}.txt`);
try { fs.unlinkSync(crashMarker); } catch { /* absent */ }

const crash = await runWorker('crash-during-mutation', workerEnv(ORG_A, {
  WORKER_CUSTOMER_ID: customerA.id,
  WORKER_INVOICE_ID: sharedInvoice.id,
  WORKER_AMOUNT: '250000',
  WORKER_CRASH_MARKER: crashMarker,
}));
check(crash.signal === 'SIGKILL' && fs.existsSync(crashMarker),
  'Worker was killed inside the uncommitted transaction');

const afterCrash = await runWithTenant(ORG_A, () => {
  udmStore.setTenantContext(ORG_A);
  return {
    payments: udmStore.getPayments().length,
    matches: udmStore.getMatches().length,
    crashPayment: udmStore.getPayments().some((payment) => payment.source_id.startsWith('crash_')),
  };
});
check(afterCrash.payments === beforeCrash.payments && afterCrash.matches === beforeCrash.matches,
  `No payments or matches from the crashed transaction (payments ${beforeCrash.payments}→${afterCrash.payments}, matches ${beforeCrash.matches}→${afterCrash.matches})`);
check(afterCrash.crashPayment === false, 'Crashed process left no partial payment record');

const reader = await runWorker('read-counts', workerEnv(ORG_A));
check(reader.code === 0 && reader.result?.ok, 'Fresh process reopened the database after the crash');
check(reader.result?.counts?.invoices === orgAInvoices.length + 1,
  `Reopened database retained committed invoices (${reader.result?.counts?.invoices})`);

// ---------------------------------------------------------------------------
// 5. Multi-process stress with distinct keys and tenant isolation.
// ---------------------------------------------------------------------------
const stressResults = await Promise.all(
  Array.from({ length: 6 }, (_, index) => runWorker('idempotent-invoice', workerEnv(index % 2 === 0 ? ORG_A : ORG_B, {
    WORKER_CUSTOMER_ID: index % 2 === 0 ? customerA.id : customerB.id,
    WORKER_IDEMPOTENCY_KEY: `idem_stress_${index}`,
    WORKER_INVOICE_NUMBER: `INV-STRESS-${index}`,
  }))),
);
check(stressResults.every((result) => result.code === 0 && result.result?.ok), 'All stress workers succeeded');

const stressInvoicesA = await runWithTenant(ORG_A, () => {
  udmStore.setTenantContext(ORG_A);
  return udmStore.getInvoices();
});
const stressInvoicesB = await runWithTenant(ORG_B, () => {
  udmStore.setTenantContext(ORG_B);
  return udmStore.getInvoices();
});
check(stressInvoicesA.every((invoice) => invoice.organization_id === ORG_A),
  'Concurrent writes did not cross tenant A boundary');
check(stressInvoicesB.every((invoice) => invoice.organization_id === ORG_B),
  'Concurrent writes did not cross tenant B boundary');
check(stressInvoicesA.length === orgAInvoices.length + 4,
  `Tenant A invoice count matches expected writes (${stressInvoicesA.length})`);
check(stressInvoicesB.length === 4, `Tenant B invoice count matches expected writes (${stressInvoicesB.length})`);

// ---------------------------------------------------------------------------
// 6. A snapshot written by an older build must remain readable and writable.
// ---------------------------------------------------------------------------
const legacyPath = `/tmp/aiospark-concurrency-legacy-${process.pid}.sqlite`;
const legacyDb = new DatabaseSync(legacyPath);
legacyDb.exec(`
  CREATE TABLE repository_snapshots (
    namespace TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
const legacyCustomer = {
  id: 'cust_legacy_snapshot',
  organization_id: ORG_A,
  source_system: 'manual',
  source_id: 'legacy_customer',
  name: 'Legacy Snapshot Customer',
  credit_limit_minor_units: 5000000,
  currency: 'INR',
  payment_terms_days: 30,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};
// Deliberately omit newer collections (idempotencyKeys/apiIdempotencyKeys)
// to simulate a pre-HIGH-009 snapshot.
legacyDb.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run(
  'udm',
  JSON.stringify({
    customers: [legacyCustomer],
    contacts: [],
    invoices: [],
    payments: [],
    matches: [],
    creditNotes: [],
    creditAllocations: [],
    disputes: [],
    disputeEvidences: [],
    exceptions: [],
    bankTransactions: [],
  }),
  '2025-01-01T00:00:00.000Z',
);
legacyDb.close();

const legacyRead = await runWorker('read-counts', workerEnv(ORG_A, { AIOSPARK_DB_PATH: legacyPath }));
check(legacyRead.code === 0 && legacyRead.result?.counts?.customers === 1,
  'Legacy snapshot without newer collections loads after upgrade');
const legacyWrite = await runWorker('idempotent-invoice', workerEnv(ORG_A, {
  AIOSPARK_DB_PATH: legacyPath,
  WORKER_CUSTOMER_ID: legacyCustomer.id,
  WORKER_IDEMPOTENCY_KEY: 'idem_legacy_upgrade',
  WORKER_INVOICE_NUMBER: 'INV-LEGACY-UPGRADE',
}));
check(legacyWrite.code === 0 && legacyWrite.result?.ok,
  'Legacy snapshot accepts a new financial write after migration');
const migratedRead = await runWorker('read-counts', workerEnv(ORG_A, { AIOSPARK_DB_PATH: legacyPath }));
check(
  migratedRead.code === 0 &&
    migratedRead.result?.counts?.customers === 1 &&
    migratedRead.result?.counts?.invoices === 1,
  'Upgraded relational state retained the legacy customer and added the invoice'
);
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(`${legacyPath}${suffix}`); } catch { /* absent */ }
}

closeDatabase();
cleanupDbFiles();
try { fs.unlinkSync(crashMarker); } catch { /* absent */ }

console.log(`\n=== CONCURRENCY SUMMARY: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
