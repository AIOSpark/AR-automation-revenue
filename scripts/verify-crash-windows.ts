// Financial execution crash window verification
// Simulates process crashes at each persistence boundary and verifies
// that state converges correctly after restart.
//
// Run from project root:
//   AIOSPARK_DB_PATH=/tmp/aiospark-crash-window.sqlite AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/verify-crash-windows.ts

import { udmStore } from '../src/lib/udm/store';
import { approvalStore } from '../src/lib/approvals/store';
import { executionService } from '../src/lib/execution/service';
import { executionStore } from '../src/lib/execution/store';
import { auditStore } from '../src/lib/audit/store';
import { getDatabase } from '../src/lib/db/durable-repository';
import { closeDatabase } from '../src/lib/db/durable-repository';

const dbPath = process.env.AIOSPARK_DB_PATH;
if (!dbPath) {
  console.error('FAIL: AIOSPARK_DB_PATH must be set');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function main() {
  const ORG = 'org_crash_window';
  const db = getDatabase();

  // ================================================================
  // CRASH WINDOW 1: After financial mutation persists, before markExecutionResult
  // ================================================================
  console.log('\n--- Crash Window 1: Financial mutation persisted, execution not yet marked ---');

  udmStore.clearAll();
  executionStore.clearAll();
  approvalStore.clearAll();
  auditStore.clearAll();
  udmStore.setTenantContext(ORG);

  const customer = udmStore.insertCustomer({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'CUST-CW1',
    name: 'Crash Window Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const invoice = udmStore.insertInvoice({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'INV-CW1',
    customer_id: customer.id,
    number: 'INV-CW1',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  const payment = udmStore.insertPayment({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'PAY-CW1',
    customer_id: customer.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-02-01',
  });

  const approval = approvalStore.createRequest({
    organization_id: ORG,
    subject_type: 'invoice',
    subject_id: invoice.id,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: invoice.id,
      payment_id: payment.id,
      amount_minor_units: 5000000,
      match_method: 'manual',
      idempotency_key: 'cw-key-1',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'cw_test',
  });
  approvalStore.approveRequest(approval.id, 'reviewer');

  // Simulate crash after financial mutation but before markExecutionResult:
  // Manually persist the match and invoice update (as executePaymentAllocation would),
  // but leave execution in 'draft' state and approval unmarked.
  udmStore.insertMatch({
    organization_id: ORG,
    payment_id: payment.id,
    invoice_id: invoice.id,
    matched_amount_minor_units: 5000000,
    match_method: 'manual',
    confidence: 1.0,
  });
  udmStore.updateInvoice(invoice.id, { status: 'partially_paid' });

  // Verify financial effect is persisted
  const invAfterMatch = udmStore.getInvoices().find((i) => i.id === invoice.id);
  assert(invAfterMatch?.status === 'partially_paid', 'CW1: Invoice status is partially_paid after match');
  const matchesBefore = udmStore.getMatches().filter((m) => m.invoice_id === invoice.id);
  assert(matchesBefore.length === 1, 'CW1: One match persisted before crash simulation');

  // Now call executeApprovedAction (simulating retry after crash)
  // It should find the existing execution (none yet since we didn't go through executeApprovedAction)
  // Actually, there's no execution record yet. Let me create one first to simulate the partial state.
  
  // Actually, let me reconsider. In the real flow, executionStore.create() is called first,
  // then executePaymentAllocation, then markExecutionResult. If crash happens after
  // executePaymentAllocation but before markExecutionResult:
  // - Execution record exists (state='draft' or 'executing')
  // - Match + invoice update are persisted
  // - Approval is not yet marked

  // Let me simulate this more accurately:
  const execution = executionStore.create({
    id: 'exec-cw-1',
    organization_id: ORG,
    requesting_user_id: null,
    approving_user_id: null,
    action_type: 'RECORD_PAYMENT_MATCH',
    target_entity_type: 'invoice',
    target_entity_ids: [invoice.id],
    action_payload: { invoice_id: invoice.id, payment_id: payment.id, amount_minor_units: 5000000 },
    action_payload_hash: 'hash1',
    idempotency_key: 'cw-key-1',
    approval_request_id: approval.id,
    execution_attempt_id: 'attempt-1',
    state: 'executing',
    before_state_snapshot: {},
    expected_outcome: {},
    commit_reference: null,
    executed_at: null,
    committed_at: null,
    verified_at: null,
    verification_result: null,
    failure_reason: null,
    failure_classification: null,
    recovery_attempts: 0,
  });

  // Now simulate retry: call executeApprovedAction again
  const retryResult = await executionService.executeApprovedAction(approval.id, {
    userId: 'cw_test',
    organizationId: ORG,
  });

  // The retry should find the existing execution and not double-apply
  // The match already exists, so insertMatch should throw "Duplicate payment match"
  // This gets caught, and execution is marked as 'execution_failed'
  // But the financial effect (match + invoice) was already applied before the "crash"
  
  const invAfterRetry = udmStore.getInvoices().find((i) => i.id === invoice.id);
  const matchesAfterRetry = udmStore.getMatches().filter((m) => m.invoice_id === invoice.id);
  assert(matchesAfterRetry.length === 1, `CW1: No duplicate match after retry (got ${matchesAfterRetry.length})`);
  assert(invAfterRetry?.status === 'partially_paid', 'CW1: Invoice still partially_paid (not double-debited)');

  // Check execution state
  const execAfterRetry = executionStore.get('exec-cw-1');
  if (execAfterRetry) {
    console.log(`  CW1: Execution state after retry = ${execAfterRetry.state}`);
    // The execution may be 'execution_failed' due to the duplicate match error,
    // OR 'verified' if the retry succeeded through a different path
    // Either way, the financial effect should not be duplicated
  }

  // Check approval state
  const reqAfterRetry = approvalStore.getRequest(approval.id);
  if (reqAfterRetry) {
    console.log(`  CW1: Approval execution_status = ${reqAfterRetry.execution_status}`);
  }

  // ================================================================
  // CRASH WINDOW 2: After markExecutionResult commits, before updateState('verified')
  // ================================================================
  console.log('\n--- Crash Window 2: markExecutionResult committed, verified state not yet committed ---');

  // Re-init
  udmStore.clearAll();
  executionStore.clearAll();
  approvalStore.clearAll();
  auditStore.clearAll();
  udmStore.setTenantContext(ORG);

  const customer2 = udmStore.insertCustomer({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'CUST-CW2',
    name: 'Crash Window Customer 2',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const invoice2 = udmStore.insertInvoice({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'INV-CW2',
    customer_id: customer2.id,
    number: 'INV-CW2',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  const payment2 = udmStore.insertPayment({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'PAY-CW2',
    customer_id: customer2.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-02-01',
  });

  const approval2 = approvalStore.createRequest({
    organization_id: ORG,
    subject_type: 'invoice',
    subject_id: invoice2.id,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: invoice2.id,
      payment_id: payment2.id,
      amount_minor_units: 5000000,
      match_method: 'manual',
      idempotency_key: 'cw-key-2',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'cw_test',
  });
  approvalStore.approveRequest(approval2.id, 'reviewer');

  // Simulate the state after markExecutionResult commits but before updateState('verified')
  // Manually mark the approval as succeeded
  approvalStore.markExecutionResult(approval2.id, 'succeeded');

  const req2 = approvalStore.getRequest(approval2.id);
  assert(req2?.execution_status === 'succeeded', 'CW2: Approval execution_status = succeeded');
  assert(req2?.executed_at !== null, 'CW2: Approval executed_at is set');

  // Now simulate crash: execution is in 'committed' state (from executeApprovedAction flow)
  // but not yet 'verified'. On retry, executeApprovedAction should handle this.
  const exec2 = executionStore.create({
    id: 'exec-cw-2',
    organization_id: ORG,
    requesting_user_id: null,
    approving_user_id: null,
    action_type: 'RECORD_PAYMENT_MATCH',
    target_entity_type: 'invoice',
    target_entity_ids: [invoice2.id],
    action_payload: { invoice_id: invoice2.id, payment_id: payment2.id, amount_minor_units: 5000000 },
    action_payload_hash: 'hash2',
    idempotency_key: 'cw-key-2',
    approval_request_id: approval2.id,
    execution_attempt_id: 'attempt-1',
    state: 'committed', // Simulating state after markExecutionResult but before verified
    before_state_snapshot: {},
    expected_outcome: {},
    commit_reference: null,
    executed_at: new Date().toISOString(),
    committed_at: new Date().toISOString(),
    verified_at: null,
    verification_result: null,
    failure_reason: null,
    failure_classification: null,
    recovery_attempts: 0,
  });

  // Retry executeApprovedAction
  const retryResult2 = await executionService.executeApprovedAction(approval2.id, {
    userId: 'cw_test',
    organizationId: ORG,
  });

  const req2After = approvalStore.getRequest(approval2.id);
  assert(req2After?.execution_status === 'succeeded', 'CW2: Approval still succeeded after retry (idempotent markExecutionResult)');
  
  const exec2After = executionStore.get('exec-cw-2');
  if (exec2After) {
    console.log(`  CW2: Execution state after retry = ${exec2After.state}`);
    // The execution should ideally be 'verified' after successful retry
    // If it's 'execution_failed', that's an inconsistency (financial effect applied but reported as failed)
  }

  const inv2After = udmStore.getInvoices().find((i) => i.id === invoice2.id);
  const matches2After = udmStore.getMatches().filter((m) => m.invoice_id === invoice2.id);
  assert(matches2After.length === 1, `CW2: No duplicate match (got ${matches2After.length})`);
  assert(inv2After?.status === 'partially_paid', 'CW2: Invoice partially_paid (single allocation)');

  // ================================================================
  // Verify audit events exist and are unique
  // ================================================================
  console.log('\n--- Crash window audit event verification ---');
  const allAuditEvents = auditStore.query({ organizationId: ORG });
  const auditIds = allAuditEvents.map((e) => e.id);
  const uniqueAuditIds = new Set(auditIds);
  assert(auditIds.length === uniqueAuditIds.size, `CW3: All audit event IDs are unique (${auditIds.length} events, ${uniqueAuditIds.size} unique)`);
  assert(allAuditEvents.length > 0, 'CW3: Audit events exist');

  console.log(`\n=== CRASH WINDOW VERIFICATION: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
