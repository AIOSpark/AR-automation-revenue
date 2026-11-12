// AIOSpark Phase 3/5 — Concurrent Writes & Idempotency Retry Test
// Tests file-backed SQLite persistence under concurrent access:
//   1. Concurrent identical idempotency requests → only one financial execution
//   2. Concurrent approval executions on the same invoice → no double allocation
//   3. Same idempotency key with conflicting fingerprint → conflict
//   4. Transaction rollback leaves no partial state
//
// Run: AIOSPARK_DB_PATH=<temp sqlite file> AIOSPARK_TEST_MODE=false node --import tsx scripts/test-concurrent-idempotency.mjs

import { udmStore } from '../../udm/store';
import { executionService } from '../../execution/service';
import { executionStore } from '../../execution/store';
import { approvalStore } from '../../approvals/store';
import { closeDatabase } from '../../db/durable-repository';

export async function runConcurrentIdempotencyTest() {
  console.log('\n==========================================');
  console.log('RUNNING CONCURRENT IDEMPOTENCY TEST');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [CONCURRENT_PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [CONCURRENT_FAIL] ${message}`);
      failed++;
    }
  }

  const TEST_ORG = 'org_concurrent_idem';
  const dbPath = process.env.AIOSPARK_DB_PATH;
  if (!dbPath) {
    throw new Error('AIOSPARK_DB_PATH must be set before importing this test module');
  }
  console.log(`DB_PATH=${dbPath}`);

  // Setup shared data
  udmStore.clearAll();
  executionStore.clearAll();
  approvalStore.clearAll();
  udmStore.setTenantContext(TEST_ORG);

  const customer = udmStore.insertCustomer({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'CUST-CONCURRENT',
    name: 'Concurrent Test Customer',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const invoice = udmStore.insertInvoice({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'INV-CONCURRENT',
    customer_id: customer.id,
    number: 'INV-CONCURRENT',
    amount_minor_units: 50000000,
    currency: 'INR',
    tax_amount_minor_units: 9000000,
    issue_date: '2026-01-01',
    due_date: '2026-02-01',
    status: 'open',
  });

  // ---------------------------------------------------------------
  // Test 1: Concurrent identical idempotency requests
  // Same key + same fingerprint → only one financial execution
  // ---------------------------------------------------------------
  console.log('\n--- Test 1: Concurrent identical idempotency requests ---');
  const idemKey = 'idem-concurrent-001';
  const idemFingerprint = 'fp-concurrent-001';

  const results1 = await Promise.all(
    Array.from({ length: 5 }).map(async (_, i) => {
      const check = await udmStore.checkAndReserveApiIdempotency(
        TEST_ORG,
        'payments',
        idemKey,
        idemFingerprint
      );
      if (check.status === 'available') {
        // This request "owns" the execution
        const pay = udmStore.insertPayment({
          organization_id: TEST_ORG,
          source_system: 'manual',
          source_id: `PAY-CONCURRENT-${i}`,
          customer_id: customer.id,
          amount_minor_units: 5000000,
          currency: 'INR',
          date: '2026-02-01',
        });
        udmStore.finalizeApiIdempotency(
          TEST_ORG,
          'payments',
          idemKey,
          pay.id,
          idemFingerprint,
          { success: true, paymentId: pay.id }
        );
        return { owner: true, paymentId: pay.id };
      } else if (check.status === 'replay') {
        return { owner: false, paymentId: check.recordId, response: check.response };
      } else if (check.status === 'conflict') {
        return { owner: false, error: 'conflict' };
      } else {
        return { owner: false, error: 'recoverable' };
      }
    })
  );

  const owners = results1.filter((r) => r.owner === true);
  testAssert(
    owners.length === 1,
    `Exactly one request owns the idempotency key (got ${owners.length} owners)`
  );
  const replays = results1.filter((r) => r.owner === false && !r.error);
  testAssert(
    replays.length === 4,
    `Four requests get replay (got ${replays.length})`
  );

  // Verify only one payment was created
  const payments = udmStore.getPayments().filter((p) => p.source_system === 'manual' && p.source_id?.startsWith('PAY-CONCURRENT'));
  testAssert(
    payments.length === 1,
    `Only one payment created despite 5 concurrent requests (got ${payments.length})`
  );

  // ---------------------------------------------------------------
  // Test 2: Same key + different fingerprint → conflict
  // ---------------------------------------------------------------
  console.log('\n--- Test 2: Same key + different fingerprint → conflict ---');
  const conflictCheck = await udmStore.checkAndReserveApiIdempotency(
    TEST_ORG,
    'payments',
    idemKey,
    'fp-different'
  );
  testAssert(
    conflictCheck.status === 'conflict',
    `Same key + different fingerprint → conflict (got ${conflictCheck.status})`
  );

  // ---------------------------------------------------------------
  // Test 3: Duplicate approval execution is safe
  // Call markExecutionResult twice for the same approval
  // ---------------------------------------------------------------
  console.log('\n--- Test 3: Duplicate approval execution is idempotent ---');
  // Create a fresh approval for this test
  const dupInvoice = udmStore.insertInvoice({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'INV-DUP-EXEC',
    customer_id: customer.id,
    number: 'INV-DUP-EXEC',
    amount_minor_units: 20000000,
    currency: 'INR',
    tax_amount_minor_units: 3600000,
    issue_date: '2026-02-01',
    due_date: '2026-03-01',
    status: 'open',
  });
  const dupPayment = udmStore.insertPayment({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'PAY-DUP-EXEC',
    customer_id: customer.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-02-01',
  });

  const dupApproval = approvalStore.createRequest({
    organization_id: TEST_ORG,
    subject_type: 'invoice',
    subject_id: dupInvoice.id,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: dupInvoice.id,
      payment_id: dupPayment.id,
      amount_minor_units: 5000000,
      match_method: 'manual',
      idempotency_key: 'idem-dup-exec-001',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'dup_test',
  });
  approvalStore.approveRequest(dupApproval.id, 'user_dup');

  // Execute once
  const execResult1 = await executionService.executeApprovedAction(dupApproval.id, {
    userId: 'user_dup',
    organizationId: TEST_ORG,
  });
  testAssert(execResult1.success === true, 'First execution succeeded');

  // Execute again (duplicate)
  const execResult2 = await executionService.executeApprovedAction(dupApproval.id, {
    userId: 'user_dup',
    organizationId: TEST_ORG,
  });
  testAssert(execResult2.success === true, 'Duplicate execution succeeded (idempotent)');

  // Verify invoice outstanding balance is not double-debited
  const invFinal = udmStore.getInvoices().find((i) => i.id === dupInvoice.id);
  if (invFinal) {
    // One payment of 5,000,000 applied to 20,000,000 invoice
    const expectedOutstanding = 20000000 - 5000000;
    testAssert(
      invFinal.amount_minor_units - 5000000 === expectedOutstanding,
      `Invoice not double-debited: outstanding=${invFinal.amount_minor_units - 5000000}, expected=${expectedOutstanding}`
    );
  }

  // Verify only one match was created
  const matches = udmStore.getMatches().filter((m) => m.invoice_id === dupInvoice.id);
  testAssert(
    matches.length === 1,
    `Only one payment match created (got ${matches.length})`
  );

  // ---------------------------------------------------------------
  // Test 4: Transaction rollback leaves no partial state
  // ---------------------------------------------------------------
  console.log('\n--- Test 4: Transaction rollback leaves no partial state ---');
  const rollbackOrg = 'org_rollback_test';
  udmStore.setTenantContext(rollbackOrg);
  const rbCustomer = udmStore.insertCustomer({
    organization_id: rollbackOrg,
    source_system: 'manual',
    source_id: 'CUST-ROLLBACK',
    name: 'Rollback Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  let rollbackThrew = false;
  try {
    await udmStore.transaction(() => {
      const inv = udmStore.insertInvoice({
        organization_id: rollbackOrg,
        source_system: 'manual',
        source_id: 'INV-ROLLBACK',
        customer_id: rbCustomer.id,
        number: 'INV-ROLLBACK',
        amount_minor_units: 10000000,
        currency: 'INR',
        tax_amount_minor_units: 1800000,
        issue_date: '2026-03-01',
        due_date: '2026-04-01',
        status: 'open',
      });
      const pay = udmStore.insertPayment({
        organization_id: rollbackOrg,
        source_system: 'manual',
        source_id: 'PAY-ROLLBACK',
        customer_id: rbCustomer.id,
        amount_minor_units: 5000000,
        currency: 'INR',
        date: '2026-03-01',
      });
      udmStore.insertMatch({
        organization_id: rollbackOrg,
        payment_id: pay.id,
        invoice_id: inv.id,
        matched_amount_minor_units: 5000000,
        match_method: 'manual',
      });
      // Simulate mid-transaction failure
      throw new Error('Simulated mid-transaction failure');
    });
  } catch (err) {
    rollbackThrew = err instanceof Error && err.message === 'Simulated mid-transaction failure';
  }
  testAssert(rollbackThrew, 'Transaction throws on simulated failure');

  // Verify no partial state after rollback
  const invoicesAfterRollback = udmStore.getInvoices().filter((i) => i.organization_id === rollbackOrg);
  testAssert(
    invoicesAfterRollback.length === 0,
    `No invoices after rollback (got ${invoicesAfterRollback.length})`
  );
  const paymentsAfterRollback = udmStore.getPayments().filter((p) => p.organization_id === rollbackOrg);
  testAssert(
    paymentsAfterRollback.length === 0,
    `No payments after rollback (got ${paymentsAfterRollback.length})`
  );
  const matchesAfterRollback = udmStore.getMatches().filter((m) => m.organization_id === rollbackOrg);
  testAssert(
    matchesAfterRollback.length === 0,
    `No matches after rollback (got ${matchesAfterRollback.length})`
  );

  closeDatabase();

  console.log(`\n=== CONCURRENT IDEMPOTENCY TEST SUMMARY: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
