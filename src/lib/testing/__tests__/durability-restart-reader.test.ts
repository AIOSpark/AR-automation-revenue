// AIOSpark Durability Restart Reader — child process
// Reads from the same SQLite file after a process restart and verifies
// data consistency: financial state, execution records, approval state, audit events.
//
// Run as child process from durability-restart.test.ts with AIOSPARK_DB_PATH set.

import { udmStore } from '../../udm/store';
import { executionStore } from '../../execution/store';
import { approvalStore } from '../../approvals/store';
import { auditStore } from '../../audit/store';
import { closeDatabase } from '../../db/durable-repository';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('[FAIL] DB path not provided as argument');
  process.exit(1);
}

process.env.AIOSPARK_DB_PATH = dbPath;
process.env.AIOSPARK_TEST_MODE = 'false';

const TEST_ORG = process.env.SQLITE_TEST_ORG || '';
const EXPECTED_INVOICE_ID = process.env.SQLITE_EXPECTED_INVOICE_ID || '';
const EXPECTED_PAYMENT_ID = process.env.SQLITE_EXPECTED_PAYMENT_ID || '';
const EXPECTED_APPROVAL_ID = process.env.SQLITE_EXPECTED_APPROVAL_ID || '';
const EXPECTED_EXECUTION_ID = process.env.SQLITE_EXPECTED_EXECUTION_ID || '';

let failures = 0;

function fail(message: string) {
  console.error(`[FAIL] ${message}`);
  failures++;
}

function pass(message: string) {
  console.log(`[PASS] ${message}`);
}

// Force reload from durable state (no in-memory cache)
udmStore.setTenantContext(TEST_ORG);

// Verify invoice
const invoices = udmStore.getInvoices();
const invoice = invoices.find((i) => i.id === EXPECTED_INVOICE_ID);
if (invoice) {
  pass(`Invoice ${EXPECTED_INVOICE_ID} found after restart`);
  if (invoice.amount_minor_units === 7500000) {
    pass('Invoice amount correct (7,500,000)');
  } else {
    fail(`Invoice amount wrong: ${invoice.amount_minor_units}`);
  }
  if (invoice.status === 'partially_paid') {
    pass('Invoice status is partially_paid');
  } else {
    fail(`Invoice status wrong: ${invoice.status}`);
  }
} else {
  fail(`Invoice ${EXPECTED_INVOICE_ID} NOT found after restart`);
}

// Verify payment
const payments = udmStore.getPayments();
const payment = payments.find((p) => p.id === EXPECTED_PAYMENT_ID);
if (payment) {
  pass(`Payment ${EXPECTED_PAYMENT_ID} found after restart`);
  if (payment.amount_minor_units === 3000000) {
    pass('Payment amount correct (3,000,000)');
  } else {
    fail(`Payment amount wrong: ${payment.amount_minor_units}`);
  }
} else {
  fail(`Payment ${EXPECTED_PAYMENT_ID} NOT found after restart`);
}

// Verify approval
const approval = approvalStore.getRequest(EXPECTED_APPROVAL_ID);
if (approval) {
  pass(`Approval ${EXPECTED_APPROVAL_ID} found after restart`);
  if (approval.status === 'approved') {
    pass('Approval status is approved');
  } else {
    fail(`Approval status wrong: ${approval.status}`);
  }
  if (approval.execution_status === 'succeeded') {
    pass('Approval execution_status is succeeded');
  } else {
    fail(`Approval execution_status wrong: ${approval.execution_status}`);
  }
} else {
  fail(`Approval ${EXPECTED_APPROVAL_ID} NOT found after restart`);
}

// Verify execution record
const execution = executionStore.getByApprovalRequestId(EXPECTED_APPROVAL_ID);
if (execution) {
  pass(`Execution record found for approval ${EXPECTED_APPROVAL_ID}`);
  if (execution.state === 'verified') {
    pass('Execution state is verified');
  } else {
    fail(`Execution state wrong: ${execution.state}`);
  }
  if (execution.id === EXPECTED_EXECUTION_ID) {
    pass('Execution ID matches');
  } else {
    fail(`Execution ID wrong: ${execution.id}`);
  }
} else {
  fail(`Execution record NOT found for approval ${EXPECTED_APPROVAL_ID}`);
}

// Verify audit events exist and are unique
const auditEvents = auditStore.query({ organizationId: TEST_ORG });
if (auditEvents.length > 0) {
  pass(`${auditEvents.length} audit event(s) found after restart`);

  // Check for duplicate audit event IDs
  const ids = auditEvents.map((e) => e.id);
  const uniqueIds = new Set(ids);
  if (ids.length === uniqueIds.size) {
    pass('All audit event IDs are unique (no duplicates)');
  } else {
    fail(`Duplicate audit event IDs found: ${ids.length} total, ${uniqueIds.size} unique`);
  }

  // Check for approval audit events
  const approvalAuditEvents = auditEvents.filter((e) => e.subject_type === 'approval');
  if (approvalAuditEvents.length >= 2) {
    pass(`${approvalAuditEvents.length} approval audit event(s) found`);
  } else {
    fail(`Expected >= 2 approval audit events, got ${approvalAuditEvents.length}`);
  }

  // Verify no two audit events have the same action_type + subject_id combination
  // that would indicate a collision from duplicate update events
  const updateEvents = auditEvents.filter((e) => e.action_type === 'approval_request_update');
  const updateIds = new Set(updateEvents.map((e) => e.id));
  if (updateIds.size === updateEvents.length) {
    pass('All approval update audit events have unique IDs');
  } else {
    fail(`Duplicate approval update audit event IDs: ${updateEvents.length} events, ${updateIds.size} unique IDs`);
  }
} else {
  fail('No audit events found after restart');
}

// Verify cross-repository consistency:
// Execution record's organization_id should match approval's organization_id
if (execution && approval) {
  if (execution.organization_id === approval.organization_id) {
    pass('Cross-repository: execution org_id matches approval org_id');
  } else {
    fail(`Cross-repository: execution org_id (${execution.organization_id}) != approval org_id (${approval.organization_id})`);
  }
}

// Close database
closeDatabase();

if (failures > 0) {
  console.error(`\n[FAIL] DURABILITY RESTART READER: ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log('\n[PASS] DURABILITY RESTART READER: all checks passed');
  process.exit(0);
}
