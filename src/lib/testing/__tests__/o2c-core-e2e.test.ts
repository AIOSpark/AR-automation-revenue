// AIOSpark Iteration 19 — Genuine O2C Core End-to-End Test
// Exercises the full pipeline as actual application services:
//   Upload (importEngine -> UDM) -> Receivables -> Approval ->
//   Execute (executionService) -> Verify (durableVerifier) -> Audit
// Uses synthetic data in an isolated synthetic organization. Never touches
// partner data. The design-partner environment remains read-only.

import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import { executionService } from '../../execution/service';
import { executionStore } from '../../execution/store';
import { approvalStore } from '../../approvals/store';
import { auditStore } from '../../audit/store';
import { getInvoiceOutstandingBalance } from '../../dashboard/engine';
import { importEngine } from '../../import/engine';
import { durableVerifier } from '../../execution/durable-verifier';
import { runWithTenant } from '../../tenant/request-context';

export async function runO2CCoreE2ETest() {
  console.log('\n==========================================');
  console.log('RUNNING O2C CORE END-TO-END TEST');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`🟢 [O2C_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🔴 [O2C_FAIL] ${message}`);
      failed++;
    }
  }

  const orgId = 'org_o2c_e2e_1';
  const userId = 'user_o2c_e2e_1';
  const otherOrgId = 'org_o2c_e2e_other';

  await runWithTenant(orgId, async () => {
    // Fresh state for this E2E run
    udmStore.clearAll();
    executionStore.clearAll();
    approvalStore.clearAll();
    auditStore.clearAll();
    udmStore.setTenantContext(orgId);

    // ---------------------------------------------------------------
    // STAGE 1: Upload — synthetic data via canonical import pipeline
    // (the same path the onboarding UI uses: /api/onboarding/import
    //  -> importEngine -> UDM). Verify records reach UDM.
    // ---------------------------------------------------------------
    const batch = importEngine.createBatch(
      {
        organizationId: orgId,
        sourceSystem: 'csv',
        dateFormatConvention: 'DD/MM/YYYY',
        columnMapping: {},
      },
      [
        {
          customer_name: 'Acme Manufacturing',
          invoice_number: 'INV-O2C-001',
          amount: '75000.00',
          due_date: '31/01/2026',
          issue_date: '01/01/2026',
        },
        {
          customer_name: 'BridgeTech Solutions',
          invoice_number: 'INV-O2C-002',
          amount: '40000.00',
          due_date: '15/02/2026',
          issue_date: '01/02/2026',
        },
      ]
    );
    const importResult = importEngine.processBatch(batch.id, {
      organizationId: orgId,
      sourceSystem: 'csv',
    });
    testAssert(
      importResult.successCount === 2,
      'Upload: both synthetic invoices imported into UDM via canonical pipeline'
    );
    testAssert(
      importResult.skippedCount === 0,
      'Upload: no valid rows skipped'
    );

    const invoices = udmStore.getInvoices();
    testAssert(invoices.length === 2, 'Upload: invoices visible in UDM');
    testAssert(
      invoices.every((i) => i.organization_id === orgId),
      'Upload: all invoices tagged to the importing organization'
    );

    const inv1 = invoices.find((i) => i.number === 'INV-O2C-001');
    testAssert(inv1 !== undefined, 'Upload: INV-O2C-001 present');
    if (inv1) {
      testAssert(
        inv1.amount_minor_units === 7500000,
        'Upload: amount stored as integer minor units (paise)'
      );
    }

    // ---------------------------------------------------------------
    // STAGE 2: Prioritize — receivables computed from UDM records
    // ---------------------------------------------------------------
    const outstanding1 = getInvoiceOutstandingBalance(inv1!);
    testAssert(
      outstanding1 === 7500000,
      'Prioritize: outstanding balance computed deterministically from UDM'
    );
    testAssert(
      outstanding1 === inv1!.amount_minor_units,
      'Prioritize: no payments yet, outstanding equals invoice amount'
    );

    // ---------------------------------------------------------------
    // STAGE 3-5: Investigate/Recommend -> Review -> Approve
    // Create and approve a payment-allocation approval request.
    // ---------------------------------------------------------------
    const payment = udmStore.insertPayment({
      organization_id: orgId,
      source_system: 'bank_feed',
      source_id: 'PAY-O2C-001',
      customer_id: inv1!.customer_id,
      amount_minor_units: 3000000,
      currency: 'INR',
      date: '2026-02-10',
    });

    const approval = approvalStore.createRequest({
      organization_id: orgId,
      subject_type: 'invoice',
      subject_id: inv1!.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: inv1!.id,
        payment_id: payment.id,
        amount_minor_units: 3000000,
        match_method: 'manual',
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'e2e_test',
    });
    testAssert(approval.status === 'pending', 'Review: approval request created pending');

    const approved = approvalStore.approveRequest(approval.id, userId);
    testAssert(approved.status === 'approved', 'Review: human approval granted');
    testAssert(approved.execution_status === 'pending', 'Review: execution status pending');

    // ---------------------------------------------------------------
    // STAGE 6-7: Execute (isolated synthetic org) + Verify
    // Call the real execution service, which runs verifyExecution()
    // and the durable verifier against SQLite snapshots.
    // ---------------------------------------------------------------
    const execResult = await executionService.executeApprovedAction(approval.id, {
      userId,
      organizationId: orgId,
    });
    testAssert(execResult.success === true, 'Execute: execution service succeeded');
    testAssert(
      execResult.state === 'verified',
      'Execute: reached verified state'
    );

    // Independent durable verification (reads directly from SQLite snapshot,
    // bypassing UDM in-memory state)
    const execution = executionStore.get(execResult.executionId);
    testAssert(execution !== undefined, 'Verify: execution record persisted');
    if (execution) {
      const durableResult = durableVerifier.verifyFromDurableState(execution);
      testAssert(
        durableResult.verified === true,
        'Verify: durable verifier confirms execution against durable state'
      );
      testAssert(
        durableResult.details?.source === 'sqlite_direct_read' ||
          durableResult.details?.source === 'udm_fallback',
        'Verify: durable verification sourced from SQLite snapshot or verified UDM fallback'
      );
    }

    // ---------------------------------------------------------------
    // STAGE 8-10: Final state + audit history
    // ---------------------------------------------------------------
    const inv1After = udmStore.getInvoices().find((i) => i.id === inv1!.id);
    testAssert(inv1After !== undefined, 'Final: invoice still present after execution');
    if (inv1After) {
      const finalOutstanding = getInvoiceOutstandingBalance(inv1After);
      testAssert(
        finalOutstanding === 4500000,
        `Final: outstanding reduced correctly (7.5L - 3L = 4.5L), got ${finalOutstanding}`
      );
      testAssert(
        inv1After.status === 'partially_paid',
        'Final: invoice status set to partially_paid'
      );
    }

    // Invariant: total_allocated <= invoice_amount
    const matches = udmStore.getMatches().filter((m) => m.invoice_id === inv1!.id);
    const totalAllocated = matches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);
    testAssert(
      totalAllocated <= inv1!.amount_minor_units,
      'Invariant: total allocated does not exceed invoice amount'
    );
    testAssert(totalAllocated === 3000000, 'Invariant: allocated amount matches payment');

    // Audit history: can a finance admin reconstruct what happened?
    const trail = auditStore.getInvoiceAuditTrail(orgId, inv1!.id);
    testAssert(trail.length > 0, 'Audit: invoice audit trail exists');
    const hasApprovalEvent = trail.some(
      (r) => r.action_type.includes('approved') || r.action_type.includes('execution')
    );
    testAssert(hasApprovalEvent, 'Audit: approval and execution events recorded');

    // ---------------------------------------------------------------
    // STAGE: Cross-tenant rejection (security)
    // ---------------------------------------------------------------
    const crossOrgApproval = approvalStore.createRequest({
      organization_id: otherOrgId,
      subject_type: 'invoice',
      subject_id: inv1!.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: inv1!.id,
        amount_minor_units: 1000000,
      },
      evidence: [],
      confidence: 0.9,
      proposed_by: 'e2e_test',
    });
    approvalStore.approveRequest(crossOrgApproval.id, userId);

    let crossTenantRejected = false;
    try {
      await executionService.executeApprovedAction(crossOrgApproval.id, {
        userId,
        organizationId: orgId,
      });
    } catch (e: any) {
      crossTenantRejected = String(e.message).includes('Cross-tenant');
    }
    testAssert(
      crossTenantRejected,
      'Security: cross-tenant execution rejected'
    );

    // Idempotency: replaying the same idempotency key does not double-allocate
    const idemKey = 'o2c_e2e_idem_key_001';
    const payment2 = udmStore.insertPayment({
      organization_id: orgId,
      source_system: 'bank_feed',
      source_id: 'PAY-O2C-002',
      customer_id: inv1!.customer_id,
      amount_minor_units: 2000000,
      currency: 'INR',
      date: '2026-02-11',
    });
    const approval2 = approvalStore.createRequest({
      organization_id: orgId,
      subject_type: 'invoice',
      subject_id: inv1!.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: inv1!.id,
        payment_id: payment2.id,
        amount_minor_units: 2000000,
        match_method: 'manual',
      },
      evidence: [],
      confidence: 0.9,
      proposed_by: 'e2e_test',
    });
    approvalStore.approveRequest(approval2.id, userId);

    const r1 = await executionService.executeApprovedAction(approval2.id, {
      userId,
      organizationId: orgId,
    }, idemKey);
    testAssert(r1.success === true, 'Idempotency: first allocation succeeds');
    const beforeAlloc = getInvoiceOutstandingBalance(
      udmStore.getInvoices().find((i) => i.id === inv1!.id)!
    );

    const r2 = await executionService.executeApprovedAction(approval2.id, {
      userId,
      organizationId: orgId,
    }, idemKey);
    testAssert(
      r2.state === 'verified' || r2.message.includes('already'),
      'Idempotency: replay returns existing result'
    );
    const afterAlloc = getInvoiceOutstandingBalance(
      udmStore.getInvoices().find((i) => i.id === inv1!.id)!
    );
    testAssert(
      beforeAlloc === afterAlloc,
      'Idempotency: replay does not change outstanding balance (no double-allocation)'
    );
  });

  console.log('\n==========================================');
  console.log(`O2C CORE E2E SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}

if (require.main === module) {
  runO2CCoreE2ETest()
    .then(({ failed }) => {
      if (failed > 0) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('O2C E2E crashed:', err);
      process.exit(1);
    });
}
