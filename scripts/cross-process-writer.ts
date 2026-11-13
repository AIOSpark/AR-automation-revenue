// Cross-process transaction safety writer
// Each invocation performs a specific scenario against a shared SQLite database.
//
// Usage:
//   node cross-process-writer.ts <dbPath> <scenario>
//
// Scenarios:
//   init        - Initialize database with customer, invoice, payments
//   idempotency - Two concurrent calls with same key + same fingerprint
//   approval    - Two concurrent markExecutionResult calls on same approval

import { udmStore } from '../src/lib/udm/store';
import { approvalStore } from '../src/lib/approvals/store';
import { executionService } from '../src/lib/execution/service';
import { closeDatabase } from '../src/lib/db/durable-repository';

const dbPath = process.argv[2];
const scenario = process.argv[3];

if (!dbPath || !scenario) {
  console.error('Usage: node cross-process-writer.ts <dbPath> <scenario>');
  process.exit(1);
}

process.env.AIOSPARK_DB_PATH = dbPath;
process.env.AIOSPARK_TEST_MODE = 'false';

const ORG = 'org_cross_process';

async function init() {
  udmStore.clearAll();
  approvalStore.clearAll();
  udmStore.setTenantContext(ORG);

  const customer = udmStore.insertCustomer({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'CUST-CROSS',
    name: 'Cross Process Customer',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const invoice = udmStore.insertInvoice({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'INV-CROSS',
    customer_id: customer.id,
    number: 'INV-CROSS',
    amount_minor_units: 50000000,
    currency: 'INR',
    tax_amount_minor_units: 9000000,
    issue_date: '2026-01-01',
    due_date: '2026-02-01',
    status: 'open',
  });

  const pay1 = udmStore.insertPayment({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'PAY-CROSS-1',
    customer_id: customer.id,
    amount_minor_units: 25000000,
    currency: 'INR',
    date: '2026-02-01',
  });
  const pay2 = udmStore.insertPayment({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'PAY-CROSS-2',
    customer_id: customer.id,
    amount_minor_units: 25000000,
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
      amount_minor_units: 10000000,
      match_method: 'manual',
      idempotency_key: 'cross-approval-idem',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'cross_test',
  });
  approvalStore.approveRequest(approval.id, 'reviewer');

  console.log(`INIT_RESULT:org=${ORG},invoice_id=${invoice.id},approval_id=${approval.id},pay1=${pay1.id},pay2=${pay2.id}`);
  closeDatabase();
}

async function idempotency() {
  udmStore.setTenantContext(ORG);
  const results = await Promise.all([
    udmStore.checkAndReserveApiIdempotency(ORG, 'payments', 'cross-idem-key', 'fp-cross'),
    udmStore.checkAndReserveApiIdempotency(ORG, 'payments', 'cross-idem-key', 'fp-cross'),
  ]);
  const statuses = results.map((r) => r.status);
  console.log(`IDEMPOTENCY_RESULT:${JSON.stringify(statuses)}`);
  closeDatabase();
}

async function approval() {
  udmStore.setTenantContext(ORG);
  // Find the first approval request for this org
  const requests = approvalStore.getRequests(ORG);
  if (requests.length === 0) {
    console.error('APPROVAL_RESULT:no_approvals_found');
    closeDatabase();
    process.exit(1);
  }
  const approval = requests[0];

  const results = await Promise.all([
    approvalStore.markExecutionResult(approval.id, 'succeeded'),
    approvalStore.markExecutionResult(approval.id, 'succeeded'),
  ]);

  const req = approvalStore.getRequest(approval.id);
  console.log(`APPROVAL_RESULT:execution_status=${req?.execution_status},executed_at=${req?.executed_at !== null}`);
  closeDatabase();
}

async function main() {
  if (scenario === 'init') await init();
  else if (scenario === 'idempotency') await idempotency();
  else if (scenario === 'approval') await approval();
  else {
    console.error(`Unknown scenario: ${scenario}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
