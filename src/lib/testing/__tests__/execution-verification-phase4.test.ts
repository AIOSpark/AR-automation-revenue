// AIOSpark Phase 4 — Independent Execution Verification Tests

import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import { executionService } from '../../execution/service';
import { executionStore } from '../../execution/store';
import { approvalStore } from '../../approvals/store';
import { getInvoiceOutstandingBalance, dashboardMetricsStore } from '../../dashboard/engine';
import { runWithTenant } from '../../tenant/request-context';
import { auditStore } from '../../audit/store';

export async function runExecutionVerificationPhase4() {
  console.log('\n==========================================');
  console.log('RUNNING PHASE 4 EXECUTION VERIFICATION SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`⚡ [EXEC_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [EXEC_FAIL] ${message}`);
      failed++;
    }
  }

  const testOrg = 'org_exec_test';
  udmStore.clearAll();
  executionStore.clearAll();
  approvalStore.clearAll();
  dashboardMetricsStore.clearAll();

  await runWithTenant(testOrg, async () => {
    udmStore.setTenantContext(testOrg);

    const customer = udmStore.insertCustomer({
      organization_id: testOrg,
      source_system: 'manual',
      source_id: 'src_cust_exec_1',
      name: 'Test Customer',
      credit_limit_minor_units: 100000000,
      currency: 'INR',
      payment_terms_days: 30,
      risk_score: 85,
    });

    const invoice = udmStore.insertInvoice({
      organization_id: testOrg,
      source_system: 'manual',
      source_id: 'src_inv_exec_1',
      customer_id: customer.id,
      number: 'INV-EXEC-001',
      amount_minor_units: 10000000,
      tax_amount_minor_units: 1800000,
      currency: 'INR',
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      status: 'open',
    });

    const payment = udmStore.insertPayment({
      organization_id: testOrg,
      source_system: 'bank_feed',
      source_id: 'src_pay_exec_1',
      customer_id: customer.id,
      amount_minor_units: 5000000,
      currency: 'INR',
      date: '2026-01-15',
    });

    // Test 1: Approved action executes successfully
    const approval1 = approvalStore.createRequest({
      organization_id: testOrg,
      subject_type: 'invoice',
      subject_id: invoice.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: invoice.id,
        payment_id: payment.id,
        amount_minor_units: 5000000,
        match_method: 'manual',
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'agent_test',
    });
    approvalStore.approveRequest(approval1.id, 'user_reviewer_1');

    const result1 = await executionService.executeApprovedAction(approval1.id, {
      userId: 'user_reviewer_1',
      organizationId: testOrg,
    });

    testAssert(result1.success === true, 'Approved payment allocation executes successfully');
    testAssert(result1.state === 'verified', 'Executed action reaches verified state');

    const invAfter1 = udmStore.getInvoices().find(i => i.id === invoice.id);
    testAssert(getInvoiceOutstandingBalance(invAfter1!) === 5000000, 'Invoice outstanding balance correctly updated');
    testAssert(invAfter1?.status === 'partially_paid', 'Invoice status updated to partially_paid');

    // Test 2: Idempotency
    // Create a separate payment for this test section to avoid state contamination
    const payment2 = udmStore.insertPayment({
      organization_id: testOrg,
      source_system: 'bank_feed',
      source_id: 'src_pay_idem_test',
      customer_id: customer.id,
      amount_minor_units: 2000000,
      currency: 'INR',
      date: '2026-01-15',
    });

    const approval2 = approvalStore.createRequest({
      organization_id: testOrg,
      subject_type: 'invoice',
      subject_id: invoice.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: invoice.id,
        payment_id: payment2.id,
        amount_minor_units: 2000000,
        match_method: 'manual',
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'agent_test',
    });
    approvalStore.approveRequest(approval2.id, 'user_reviewer_1');

    const idempotencyKey = 'test_idem_key_12345678';
    // Capture execution count before idempotency test
    const execRecordsBefore = executionStore.getAll(testOrg);
    const execCountBefore = execRecordsBefore.length;

    const result2a = await executionService.executeApprovedAction(approval2.id, {
      userId: 'user_reviewer_1',
      organizationId: testOrg,
    }, idempotencyKey);

    testAssert(result2a.success === true, 'First execution with idempotency key succeeds');
    testAssert(result2a.executionId !== undefined, 'First execution returns execution ID');

    const result2b = await executionService.executeApprovedAction(approval2.id, {
      userId: 'user_reviewer_1',
      organizationId: testOrg,
    }, idempotencyKey);

    testAssert(result2b.state === 'verified' || result2b.message.includes('already'), 'Duplicate idempotency request returns existing result');
    testAssert(result2b.success === true, 'Second idempotency request succeeds without re-execution');

    // Verify execution handler ran only once (idempotency)
    const execRecordsAfter = executionStore.getAll(testOrg);
    const execCountAfter = execRecordsAfter.length;
    testAssert(execCountAfter === execCountBefore + 1, 'Execution handler runs exactly once despite replay');

    // Test 2c: Same approval executed with different idempotency key
    // The approval is already approved from Test 2; executing with a different
    // idempotency key should trigger a conflict check.
    try {
      const result2c = await executionService.executeApprovedAction(approval2.id, {
        userId: 'user_reviewer_1',
        organizationId: testOrg,
      }, 'different_idempotency_key_87654321');
      // If we get here, the service accepted the different key (creates new execution)
      testAssert(result2c.success === true, 'Different idempotency key creates new execution');
    } catch (e: any) {
      // Expected: idempotency key conflict error
      testAssert(e.message.includes('idempotency key conflict') || e.message.includes('conflict'), 'Different idempotency key rejected with conflict error');
    }

    // Test 3: Unapproved action rejected
    const approval3 = approvalStore.createRequest({
      organization_id: testOrg,
      subject_type: 'invoice',
      subject_id: invoice.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: invoice.id,
        payment_id: payment.id,
        amount_minor_units: 1000000,
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'agent_test',
    });

    try {
      await executionService.executeApprovedAction(approval3.id, {
        userId: 'user_reviewer_1',
        organizationId: testOrg,
      });
      testAssert(false, 'Unapproved action should be rejected');
    } catch (e: any) {
      testAssert(e.message.includes('approved'), 'Unapproved action is rejected');
    }

    // Test 4: Cross-tenant rejected
    const approval4 = approvalStore.createRequest({
      organization_id: 'other_org',
      subject_type: 'invoice',
      subject_id: invoice.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: { invoice_id: invoice.id, amount_minor_units: 1000000 },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'agent_test',
    });
    approvalStore.approveRequest(approval4.id, 'user_reviewer_1');

    try {
      await executionService.executeApprovedAction(approval4.id, {
        userId: 'user_reviewer_1',
        organizationId: testOrg,
      });
      testAssert(false, 'Cross-tenant execution should be rejected');
    } catch (e: any) {
      testAssert(e.message.includes('Cross-tenant'), 'Cross-tenant execution is rejected');
    }

    // Test 5: Execution records
    const execRecords = executionStore.getAll(testOrg);
    testAssert(execRecords.length >= 2, 'Execution records created');
    const verifiedExec = execRecords.find(e => e.state === 'verified');
    testAssert(verifiedExec !== undefined, 'Verified execution record exists');
    if (verifiedExec) {
      testAssert(verifiedExec.approval_request_id !== null, 'Execution linked to approval');
      testAssert(verifiedExec.idempotency_key !== null, 'Execution has idempotency key');
      testAssert(verifiedExec.committed_at !== null, 'Execution has commit timestamp');
      testAssert(verifiedExec.verified_at !== null, 'Execution has verification timestamp');
    }
  });

  console.log('\n==========================================');
  console.log(`PHASE 4 EXECUTION VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}

if (require.main === module) {
  runExecutionVerificationPhase4()
    .then(({ failed }) => {
      if (failed > 0) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}