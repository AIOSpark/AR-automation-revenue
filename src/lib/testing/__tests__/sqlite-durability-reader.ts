// AIOSpark Iteration 21.1 — SQLite Durability Reader Script
// Executed as a child process via tsx to verify data persisted across process restart.
// Reads from the SQLite file specified by AIOSPARK_DB_PATH env var.
//
// Run: npx tsx src/lib/testing/__tests__/sqlite-durability-reader.ts <DB_PATH>

import fs from 'node:fs';
import { readSnapshotDirect, closeDatabase } from '../../db/durable-repository';
import { udmStore } from '../../udm/store';
import { executionStore } from '../../execution/store';
import { approvalStore } from '../../approvals/store';
import { auditStore } from '../../audit/store';
import { runWithTenant } from '../../tenant/request-context';

const DB_PATH = process.argv[2];
const TEST_ORG = process.env.SQLITE_TEST_ORG || 'org_sqlite_restart_a';
const EXPECTED_INVOICE_ID = process.env.SQLITE_EXPECTED_INVOICE_ID || '';
const EXPECTED_PAYMENT_ID = process.env.SQLITE_EXPECTED_PAYMENT_ID || '';
const EXPECTED_BATCH_ID = process.env.SQLITE_EXPECTED_BATCH_ID || '';
const EXPECTED_BATCH_ROWS = parseInt(process.env.SQLITE_EXPECTED_BATCH_ROWS || '1', 10);

let count = 0;
let failed = 0;

function testAssert(condition: boolean, message: string) {
  if (condition) {
    console.log(`🛡️ [SQLITE_PASS] ${message}`);
    count++;
  } else {
    console.error(`❌ [SQLITE_FAIL] ${message}`);
    failed++;
  }
}

async function main() {
  console.log('\n==========================================');
  console.log('SQLITE DURABILITY READER (child process)');
  console.log('==========================================\n');
  console.log(`DB_PATH=${DB_PATH}`);
  console.log(`File exists: ${fs.existsSync(DB_PATH)}`);
  if (fs.existsSync(DB_PATH)) {
    console.log(`File size: ${fs.statSync(DB_PATH).size} bytes`);
    const buf = fs.readFileSync(DB_PATH);
    const header = buf.subarray(0, 16).toString('latin1');
    testAssert(header.startsWith('SQLite format 3'), `SQLite file header valid: "${header}"`);
  } else {
    testAssert(false, 'SQLite database file exists');
  }

  await runWithTenant(TEST_ORG, async () => {
    udmStore.setTenantContext(TEST_ORG);

    // ---- Verify UDM data survived restart ----
    const invoices = udmStore.getInvoices();
    const inv = invoices.find((i) => i.id === EXPECTED_INVOICE_ID);
    testAssert(inv !== undefined, `Invoice ${EXPECTED_INVOICE_ID} survived restart`);
    if (inv) {
      testAssert(inv.amount_minor_units === 7500000, 'Invoice amount survived restart');
      testAssert(inv.status === 'paid', 'Invoice status survived as paid (payment + reconciliation fully settled)');
      testAssert(inv.organization_id === TEST_ORG, 'Invoice org_id still TEST_ORG');
    }

    const customers = udmStore.getCustomers();
    testAssert(customers.length >= 1, 'Customers survived restart');
    if (customers.length > 0) {
      testAssert(customers[0].organization_id === TEST_ORG, 'Customer org_id still TEST_ORG');
    }

    const payments = udmStore.getPayments();
    const pay = payments.find((p) => p.id === EXPECTED_PAYMENT_ID);
    testAssert(pay !== undefined, `Payment ${EXPECTED_PAYMENT_ID} survived restart`);
    if (pay) {
      testAssert(pay.amount_minor_units === 3000000, 'Payment amount survived restart');
    }

    const matches = udmStore.getMatches();
    const invMatches = matches.filter((m) => m.invoice_id === EXPECTED_INVOICE_ID);
    testAssert(invMatches.length >= 1, `At least 1 match for invoice survived (${invMatches.length})`);

    const appr = approvalStore.getRequest(process.env.SQLITE_EXPECTED_APPROVAL_ID || '');
    testAssert(appr !== null, `Approval request survived restart`);
    if (appr) {
      testAssert(appr.status === 'approved', 'Approval status survived as approved');
    }

    const execution = executionStore.get(process.env.SQLITE_EXPECTED_EXECUTION_ID || '');
    testAssert(execution !== null, `Execution record survived restart`);
    if (execution) {
      testAssert(execution.state === 'verified', `Execution state survived as verified`);
    }

    const auditLogs = auditStore.query({ organizationId: TEST_ORG });
    testAssert(auditLogs.length >= 1, `Audit logs survived restart (${auditLogs.length})`);
  });

  const udmState = readSnapshotDirect('udm');
  testAssert(udmState !== null, 'UDM snapshot readable directly from SQLite after restart');
  if (udmState && typeof udmState === 'object' && 'invoices' in udmState) {
    const invInSqlite = (udmState as any).invoices.find((i: any) => i.id === EXPECTED_INVOICE_ID);
    testAssert(invInSqlite !== undefined, 'Invoice found in SQLite udm snapshot after restart');
    if (invInSqlite) {
      testAssert(invInSqlite.status === 'paid', 'Invoice status in SQLite is paid (payment + reconciliation fully settled)');
    }
  }

  const importState = readSnapshotDirect('import_batches');
  testAssert(importState !== null, 'Import batches snapshot readable from SQLite after restart');
  if (importState && typeof importState === 'object' && 'batches' in importState) {
    const b = (importState.batches as any[]).find((b: any) => b.id === EXPECTED_BATCH_ID);
    testAssert(b !== undefined, `Import batch ${EXPECTED_BATCH_ID} survived in SQLite`);
    if (b) {
      testAssert(b.status === 'completed', 'Import batch status completed in SQLite');
      testAssert(b.total_rows === EXPECTED_BATCH_ROWS, 'Import batch total_rows correct in SQLite');
    }
  }

  const reconState = readSnapshotDirect('reconciliation_outcomes');
  testAssert(reconState !== null, 'Reconciliation outcomes snapshot readable from SQLite after restart');
  if (reconState && typeof reconState === 'object' && Array.isArray(reconState)) {
    testAssert(reconState.length >= 1, `Reconciliation outcomes in SQLite: ${reconState.length}`);
  }

  const execState = readSnapshotDirect('executions');
  testAssert(execState !== null, 'Executions snapshot readable from SQLite after restart');
  if (execState && typeof execState === 'object' && 'executions' in execState) {
    const executions = (execState as any).executions as any[];
    testAssert(executions.some((e: any) => e.id === process.env.SQLITE_EXPECTED_EXECUTION_ID), 'Execution found in SQLite executions snapshot after restart');
  }

  const auditState = readSnapshotDirect('audit');
  testAssert(auditState !== null, 'Audit snapshot readable from SQLite after restart');
  if (auditState && typeof auditState === 'object' && Array.isArray(auditState)) {
    const orgAAudit = (auditState as any[]).filter((a: any) => a.organization_id === TEST_ORG);
    testAssert(orgAAudit.length >= 1, `Org audit records in SQLite: ${orgAAudit.length}`);
  }

  closeDatabase();
  console.log('closeDatabase() called successfully (reader shutdown)');

  console.log(`\n=== SQLITE READER SUMMARY: ${count} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('SQLite durability reader error:', err);
  process.exit(1);
});
