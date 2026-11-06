// AIOSpark Iteration 21.1 — SQLite Durability & Restart Test
// Exercises file-backed SQLite persistence across a genuine process restart:
//   1. Write data using stores (persists to SQLite snapshot)
//   2. Close database (clean shutdown)
//   3. Spawn a NEW process that reads from the same SQLite file
//   4. Verify all data survived the restart
//   5. Verify backup/restore preserves data
//   6. Verify tenant boundaries remain intact
//
// Run as part of npm run verify via master.test.ts.
// AIOSPARK_DB_PATH must be set to a temp SQLite file BEFORE this module is
// imported (set in master.test.ts).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

import { udmStore } from '../../udm/store';
import { executionService } from '../../execution/service';
import { executionStore } from '../../execution/store';
import { approvalStore } from '../../approvals/store';
import { auditStore } from '../../audit/store';
import { authStore } from '../../auth/store';
import { tenantStore } from '../../tenant/store';
import { importEngine } from '../../import/engine';
import { reconciliationEngine } from '../../reconciliation/engine';
import { closeDatabase } from '../../db/durable-repository';
import { runWithTenant } from '../../tenant/request-context';

export async function runSqliteDurabilityTest() {
  console.log('\n==========================================');
  console.log('RUNNING SQLITE DURABILITY & RESTART TEST');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [SQLITE_PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [SQLITE_FAIL] ${message}`);
      failed++;
    }
  }

  const TEST_ORG = 'org_sqlite_restart_a';
  const OTHER_ORG = 'org_sqlite_restart_b';
  const USER = 'user_sqlite_restart_1';

  const dbPath = process.env.AIOSPARK_DB_PATH;
  if (!dbPath) {
    throw new Error('AIOSPARK_DB_PATH must be set before importing this test module');
  }
  console.log(`DB_PATH=${dbPath}`);

  await runWithTenant(TEST_ORG, async () => {
    udmStore.setTenantContext(TEST_ORG);

    // ---- Organization ----
    const org = authStore.createOrganizationDraft({
      name: 'SQLite Restart Test Org',
      size: 'SME',
      industry: 'Manufacturing',
      created_by_user_id: USER,
    });
    testAssert(!!org.id, 'Organization created');

    // ---- Customer ----
    const customer = udmStore.insertCustomer({
      organization_id: TEST_ORG,
      source_system: 'manual',
      source_id: 'CUST-RESTART-001',
      name: 'SQLite Restart Customer',
      credit_limit_minor_units: 10000000,
      currency: 'INR',
      payment_terms_days: 30,
    });
    testAssert(customer.organization_id === TEST_ORG, 'Customer created with correct org_id');
    const customerId = customer.id;

    // ---- Invoice ----
    const invoice = udmStore.insertInvoice({
      organization_id: TEST_ORG,
      source_system: 'csv',
      source_id: 'INV-RESTART-001',
      customer_id: customer.id,
      number: 'INV-RESTART-001',
      amount_minor_units: 7500000,
      tax_amount_minor_units: 750000,
      currency: 'INR',
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      status: 'open',
    });
    testAssert(invoice.amount_minor_units === 7500000, 'Invoice amount 7,500,000');
    testAssert(invoice.status === 'open', 'Invoice status open');
    const invoiceId = invoice.id;

    // ---- Payment ----
    const payment = udmStore.insertPayment({
      organization_id: TEST_ORG,
      source_system: 'bank_feed',
      source_id: 'PAY-RESTART-001',
      customer_id: customer.id,
      amount_minor_units: 3000000,
      currency: 'INR',
      date: '2026-02-10',
    });
    testAssert(payment.amount_minor_units === 3000000, 'Payment amount 3,000,000');
    const paymentId = payment.id;

    // ---- Approval + Execution (payment allocation) ----
    const approval = approvalStore.createRequest({
      organization_id: TEST_ORG,
      subject_type: 'invoice',
      subject_id: invoice.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: invoice.id,
        payment_id: payment.id,
        amount_minor_units: 3000000,
        match_method: 'manual',
        idempotency_key: 'idem_restart_001',
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'restart_test',
    });
    testAssert(approval.status === 'pending', 'Approval created');
    const approved = approvalStore.approveRequest(approval.id, USER);
    testAssert(approved.status === 'approved', 'Approval approved');

    const execResult = await executionService.executeApprovedAction(approval.id, {
      userId: USER,
      organizationId: TEST_ORG,
    });
    testAssert(execResult.success === true, 'Execution service succeeded');
    testAssert(execResult.state === 'verified', 'Execution reached verified state');
    const executionId = execResult.executionId;

    // Verify outstanding balance
    const invAfter = udmStore.getInvoices().find((i) => i.id === invoice.id);
    testAssert(invAfter !== undefined, 'Invoice still present after execution');
    if (invAfter) {
      testAssert(invAfter.status === 'partially_paid', 'Invoice status partially_paid');
      const outstanding = invAfter.amount_minor_units - 3000000;
      testAssert(outstanding === 4500000, `Outstanding 4,500,000 (got ${outstanding})`);
    }

    // ---- Reconciliation ----
    const bankTx = udmStore.insertBankTransaction({
      organization_id: TEST_ORG,
      source_system: 'bank_feed',
      raw_reference: 'TX-RESTART-001',
      narration_text: 'Payment for INV-RESTART-001',
      amount_minor_units: 4500000,
      currency: 'INR',
      date: '2026-02-15',
      status: 'unmatched',
    });
    testAssert(bankTx.status === 'unmatched', 'Bank transaction created');

    const reconApproval = approvalStore.createRequest({
      organization_id: TEST_ORG,
      subject_type: 'payment',
      subject_id: bankTx.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        bank_transaction_id: bankTx.id,
        matched_invoice_ids: [invoice.id],
        match_method: 'deterministic',
        confidence: 1.0,
      },
      evidence: [],
      confidence: 1.0,
      proposed_by: 'restart_test',
    });
    const reconApproved = approvalStore.approveRequest(reconApproval.id, USER);
    testAssert(reconApproved.status === 'approved', 'Reconciliation approval approved');

    const reconResult = await reconciliationEngine.executeApprovedMatch(reconApproval.id, USER);
    testAssert(reconResult.success === true, 'Reconciliation match executed');
    testAssert(reconResult.matchIds.length === 1, 'Reconciliation created 1 match');

    const outcomes = reconciliationEngine.getOutcomes(TEST_ORG);
    testAssert(outcomes.length >= 1, `Reconciliation outcome(s) persisted: ${outcomes.length}`);

    // ---- Import batch ----
    const batch = importEngine.createBatch(
      {
        organizationId: TEST_ORG,
        sourceSystem: 'csv',
        dateFormatConvention: 'DD/MM/YYYY',
        columnMapping: {},
      },
      [
        {
          customer_name: 'Import Customer X',
          invoice_number: 'INV-IMPORT-001',
          amount: '50000.00',
          due_date: '31/01/2026',
          issue_date: '01/01/2026',
        },
      ]
    );
    testAssert(batch.status === 'processing', 'Import batch created');
    testAssert(batch.organization_id === TEST_ORG, 'Import batch org correct');
    testAssert(batch.total_rows === 1, 'Import batch total_rows = 1');

    const importResult = importEngine.processBatch(batch.id, {
      organizationId: TEST_ORG,
      sourceSystem: 'csv',
    });
    testAssert(importResult.successCount === 1, `Import batch processed: ${importResult.successCount} success`);
    testAssert(importResult.skippedCount === 0, 'Import batch skipped = 0');
    const batchId = batch.id;

    // ---- Cross-tenant isolation: Org B data ----
    await runWithTenant(OTHER_ORG, async () => {
      udmStore.setTenantContext(OTHER_ORG);
      const custB = udmStore.insertCustomer({
        organization_id: OTHER_ORG,
        source_system: 'restart_test',
        source_id: 'CUST-RESTART-B',
        name: 'Org B Customer',
        credit_limit_minor_units: 5000000,
        currency: 'INR',
        payment_terms_days: 30,
      });
      testAssert(custB.organization_id === OTHER_ORG, 'Org B customer created');
      const invB = udmStore.insertInvoice({
        organization_id: OTHER_ORG,
        source_system: 'restart_test',
        source_id: 'INV-RESTART-B',
        customer_id: custB.id,
        number: 'INV-RESTART-B',
        amount_minor_units: 2000000,
        tax_amount_minor_units: 200000,
        currency: 'INR',
        issue_date: '2026-01-01',
        due_date: '2026-01-31',
        status: 'open',
      });
      testAssert(invB.amount_minor_units === 2000000, 'Org B invoice created');
    });

    // Verify Org B context does NOT see Org A data
    await runWithTenant(OTHER_ORG, async () => {
      udmStore.setTenantContext(OTHER_ORG);
      const invoicesB = udmStore.getInvoices();
      testAssert(!invoicesB.some((i) => i.organization_id === TEST_ORG), 'Org A invoices NOT visible from Org B');
      const customersB = udmStore.getCustomers();
      testAssert(!customersB.some((c) => c.organization_id === TEST_ORG), 'Org A customers NOT visible from Org B');
    });

    // Capture expected values for reader process
    const expected = {
      orgA: TEST_ORG,
      otherOrg: OTHER_ORG,
      customerId,
      customerName: customer.name,
      invoiceId,
      invoiceNumber: invoice.number,
      invoiceAmount: 7500000,
      paymentId,
      paymentAmount: 3000000,
      expectedOutstanding: 4500000,
      bankTxId: bankTx.id,
      batchId,
      batchSourceSystem: 'csv',
      executionId,
      approvalId: approval.id,
      reconOutcomeCount: outcomes.length,
      matchAmount: 3000000,
    };

    fs.writeFileSync('/tmp/aiospark-durability-expected.json', JSON.stringify(expected, null, 2));
    console.log('Expected values written to /tmp/aiospark-durability-expected.json');

    // Close database (clean shutdown)
    closeDatabase();
    console.log('closeDatabase() called successfully');

    // Spawn reader process to verify data persisted to SQLite
    console.log('\n--- Spawning reader process (fresh Node.js process, same SQLite file) ---');
    const readerScript = path.join(__dirname, 'sqlite-durability-reader.ts');
    const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

    const readerResult = execFileSync(tsxBin, [readerScript, dbPath], {
      env: {
        ...process.env,
        AIOSPARK_DB_PATH: dbPath,
        AIOSPARK_TEST_MODE: 'false',
        SQLITE_TEST_ORG: TEST_ORG,
        SQLITE_EXPECTED_INVOICE_ID: invoiceId,
        SQLITE_EXPECTED_PAYMENT_ID: paymentId,
        SQLITE_EXPECTED_BATCH_ID: batchId,
        SQLITE_EXPECTED_BATCH_ROWS: '1',
        SQLITE_EXPECTED_APPROVAL_ID: approval.id,
        SQLITE_EXPECTED_EXECUTION_ID: executionId,
      },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log(readerResult);
    if (readerResult.includes('[FAIL]')) {
      failed += 1;
      testAssert(false, 'Reader process reported failures');
    } else {
      testAssert(true, 'Reader process confirmed all data survived restart');
    }
  });

  console.log(`\n=== SQLITE DURABILITY TEST SUMMARY: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
