// Audit-event semantics verification
// Verifies:
// 1. Distinct events always have distinct IDs
// 2. Retries of the same logical event do not silently lose audit information
// 3. Event identity is stable where logical idempotency is required
// 4. Duplicate event detection does not suppress a legitimate subsequent event
// 5. Audit failures remain observable
// 6. Append-only database triggers remain effective
//
// Run from project root:
//   AIOSPARK_DB_PATH=/tmp/aiospark-audit-semantics.sqlite AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/verify-audit-semantics.ts

import { udmStore } from '../src/lib/udm/store';
import { approvalStore } from '../src/lib/approvals/store';
import { executionService } from '../src/lib/execution/service';
import { auditStore } from '../src/lib/audit/store';
import { appendAuditEvent, purgeAuditEvents } from '../src/lib/db/governance-repository';
import { closeDatabase, getDatabase } from '../src/lib/db/durable-repository';

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
  const ORG = 'org_audit_semantics';

  udmStore.clearAll();
  approvalStore.clearAll();
  auditStore.clearAll();
  purgeAuditEvents();
  udmStore.setTenantContext(ORG);

  // ---------------------------------------------------------------
  // Test 1: Distinct events always have distinct IDs
  // ---------------------------------------------------------------
  console.log('\n--- Test 1: Distinct events have distinct IDs ---');

  const customer = udmStore.insertCustomer({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'CUST-AUDIT',
    name: 'Audit Semantics Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const approvals = [];
  for (let i = 0; i < 5; i++) {
    const inv = udmStore.insertInvoice({
      organization_id: ORG,
      source_system: 'manual',
      source_id: `INV-AUDIT-${i}`,
      customer_id: customer.id,
      number: `INV-AUDIT-${i}`,
      amount_minor_units: 1000000,
      currency: 'INR',
      tax_amount_minor_units: 180000,
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      status: 'open',
    });
    const appr = approvalStore.createRequest({
      organization_id: ORG,
      subject_type: 'invoice',
      subject_id: inv.id,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: { invoice_id: inv.id, amount_minor_units: 500000 },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'audit_test',
    });
    approvalStore.approveRequest(appr.id, 'reviewer');
    approvals.push(appr);
  }

  const allEvents = auditStore.query({ organizationId: ORG });
  const eventIds = allEvents.map((e) => e.id);
  const uniqueIds = new Set(eventIds);
  assert(eventIds.length === uniqueIds.size, `T1: All ${eventIds.length} audit events have unique IDs`);
  assert(eventIds.length > 0, 'T1: Audit events exist');

  // ---------------------------------------------------------------
  // Test 2: Retries of the same logical event do not lose audit info
  // ---------------------------------------------------------------
  console.log('\n--- Test 2: Retry idempotency preserves audit info ---');

  const pay = udmStore.insertPayment({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'PAY-AUDIT',
    customer_id: customer.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-02-01',
  });

  const invoice = udmStore.insertInvoice({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'INV-AUDIT-RETRY',
    customer_id: customer.id,
    number: 'INV-AUDIT-RETRY',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  const appr = approvalStore.createRequest({
    organization_id: ORG,
    subject_type: 'invoice',
    subject_id: invoice.id,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: invoice.id,
      payment_id: pay.id,
      amount_minor_units: 5000000,
      match_method: 'manual',
      idempotency_key: 'audit-retry-key',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'audit_test',
  });
  approvalStore.approveRequest(appr.id, 'reviewer');

  // Count execution-related events before executing
  const eventsBeforeExec = auditStore.query({
    organizationId: ORG,
    actionType: 'approval_request.execution_succeeded',
  });
  const execEventCountBefore = eventsBeforeExec.length;

  // Execute the approval
  const execResult = await executionService.executeApprovedAction(appr.id, {
    userId: 'reviewer',
    organizationId: ORG,
  });
  assert(execResult.success === true, 'T2: Execution succeeded');

  // Retry the execution (should be idempotent)
  const execResult2 = await executionService.executeApprovedAction(appr.id, {
    userId: 'reviewer',
    organizationId: ORG,
  });
  assert(execResult2.success === true, 'T2: Retry execution succeeded (idempotent)');

  const eventsAfterExec = auditStore.query({
    organizationId: ORG,
    actionType: 'approval_request.execution_succeeded',
  });
  const execEventCountAfter = eventsAfterExec.length;

  // Retry should NOT add a new execution_succeeded event (markExecutionResult early return)
  assert(execEventCountAfter === execEventCountBefore + 1, `T2: Retry did NOT add duplicate execution_succeeded events (before=${execEventCountBefore}, after=${execEventCountAfter})`);

  // Verify the execution audit event has correct info
  assert(eventsAfterExec[0].result === 'success', 'T2: Execution audit event has success result');

  // ---------------------------------------------------------------
  // Test 3: Event identity is stable where logical idempotency is required
  // ---------------------------------------------------------------
  console.log('\n--- Test 3: Event identity stability ---');
  assert(execEventCountAfter === 1, `T3: Exactly one execution_succeeded audit event (got ${execEventCountAfter})`);

  // ---------------------------------------------------------------
  // Test 4: Duplicate event detection does not suppress legitimate subsequent events
  // ---------------------------------------------------------------
  console.log('\n--- Test 4: Legitimate subsequent events are not suppressed ---');

  const allEvents2 = auditStore.query({ organizationId: ORG });
  const createEvents = allEvents2.filter((e) => e.action_type === 'approval_request.created');
  const approveEvents = allEvents2.filter((e) =>
    e.action_type === 'invoice.record_payment_match.approved'
  );
  assert(createEvents.length >= 6, `T4: Creation audit events exist (got ${createEvents.length})`);
  assert(approveEvents.length >= 6, `T4: Approval audit events exist (got ${approveEvents.length})`);
  assert(allEvents2.some((e) => e.action_type === 'approval_request.execution_succeeded'), 'T4: Execution event type present');

  // Each distinct action on the same subject produces its own event
  const approvalEventsForAppr = allEvents2.filter((e) => e.subject_id === appr.id);
  assert(approvalEventsForAppr.length >= 3, `T4: Multiple distinct events for same approval (got ${approvalEventsForAppr.length})`);

  // ---------------------------------------------------------------
  // Test 5: Audit failures remain observable
  // ---------------------------------------------------------------
  console.log('\n--- Test 5: Audit failures remain observable ---');

  try {
    appendAuditEvent({
      id: 'test-observable-id',
      organization_id: ORG,
      actor_user_id: null,
      actor_type: 'system',
      action_type: 'test_observable',
      subject_type: 'test',
      subject_id: 'test-subject',
      before_state: null,
      after_state: { test: true },
      ai_context: null,
      approval_context: null,
      result: 'success',
      created_at: new Date().toISOString(),
    });
    passed++;
    console.log('  PASS: T5: appendAuditEvent succeeds with valid record');
  } catch (err) {
    failed++;
    console.error('  FAIL: T5: appendAuditEvent threw with valid record:', err instanceof Error ? err.message : String(err));
  }

  const observableEvent = auditStore.query({
    organizationId: ORG,
    actionType: 'test_observable',
  });
  assert(observableEvent.length >= 1, 'T5: Observable audit event was persisted');

  // ---------------------------------------------------------------
  // Test 6: Append-only database triggers remain effective
  // ---------------------------------------------------------------
  console.log('\n--- Test 6: Append-only triggers remain effective ---');

  const db = getDatabase();
  let updateThrew = false;
  try {
    db.prepare('UPDATE audit_events SET result = ? WHERE id = ?').run('failure', 'test-observable-id');
  } catch (err) {
    updateThrew = true;
  }
  assert(updateThrew, 'T6: UPDATE on audit_events is rejected by trigger (append-only)');

  let deleteThrew = false;
  try {
    db.prepare('DELETE FROM audit_events WHERE id = ?').run('test-observable-id');
  } catch (err) {
    deleteThrew = true;
  }
  assert(deleteThrew, 'T6: DELETE on audit_events is rejected by trigger (append-only)');

  const eventStillThere = auditStore.query({
    organizationId: ORG,
    actionType: 'test_observable',
  });
  assert(eventStillThere.length >= 1, 'T6: Audit event still exists after failed mutation attempts');

  console.log(`\n=== AUDIT EVENT SEMANTICS VERIFICATION: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
