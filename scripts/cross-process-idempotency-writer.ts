// Cross-process idempotency race recovery writer
// Each invocation performs a specific scenario against a shared SQLite database.
// Separate Node.js processes share one file-backed SQLite database to test
// cross-process idempotency race handling.
//
// Usage:
//   node cross-process-idempotency-writer.ts <dbPath> <scenario>
//
// Scenarios:
//   init                  - Initialize database with customer, invoice, payments, approval
//   idem-identical-2      - 2 concurrent calls with same key + same fingerprint
//   idem-identical-10     - 10 concurrent calls with same key + same fingerprint
//   idem-conflict         - Identical keys with conflicting fingerprints
//   recovery-concurrent   - Concurrent recovery of same execution (post-crash)
//   alloc-concurrent      - Concurrent execution of same approved financial action

import { udmStore } from '../src/lib/udm/store';
import { approvalStore } from '../src/lib/approvals/store';
import { executionService } from '../src/lib/execution/service';
import { executionStore } from '../src/lib/execution/store';
import { closeDatabase } from '../src/lib/db/durable-repository';

const dbPath = process.argv[2];
const scenario = process.argv[3];

if (!dbPath || !scenario) {
  console.error('Usage: node cross-process-idempotency-writer.ts <dbPath> <scenario>');
  process.exit(1);
}

process.env.AIOSPARK_DB_PATH = dbPath;
process.env.AIOSPARK_TEST_MODE = 'false';

const ORG = 'org_cross_idem';

async function init() {
  udmStore.clearAll();
  executionStore.clearAll();
  approvalStore.clearAll();
  udmStore.setTenantContext(ORG);

  const customer = udmStore.insertCustomer({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'CUST-CROSS-IDEM',
    name: 'Cross Idempotency Customer',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const invoice = udmStore.insertInvoice({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'INV-CROSS-IDEM',
    customer_id: customer.id,
    number: 'INV-CROSS-IDEM',
    amount_minor_units: 50000000,
    currency: 'INR',
    tax_amount_minor_units: 9000000,
    issue_date: '2026-01-01',
    due_date: '2026-02-01',
    status: 'open',
  });

  const payment = udmStore.insertPayment({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'PAY-CROSS-IDEM',
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
      idempotency_key: 'cross-idem-key',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'cross_test',
  });
  approvalStore.approveRequest(approval.id, 'reviewer');

  console.log(`INIT_RESULT:org=${ORG},invoice_id=${invoice.id},payment_id=${payment.id},approval_id=${approval.id}`);
  closeDatabase();
}

async function idemIdentical(count: number) {
  udmStore.setTenantContext(ORG);
  const results = await Promise.all(
    Array.from({ length: count }).map(() =>
      udmStore.checkAndReserveApiIdempotency(ORG, 'payments', 'cross-idem-key', 'fp-cross')
    )
  );
  const statuses = results.map((r) => r.status);
  console.log(`IDEMPOTENCY_RESULT:${JSON.stringify(statuses)}`);
  closeDatabase();
}

async function idemConflict() {
  udmStore.setTenantContext(ORG);
  // First reserve with fingerprint-a, then try with fingerprint-b
  const results = await Promise.all([
    udmStore.checkAndReserveApiIdempotency(ORG, 'payments', 'cross-idem-key-conflict', 'fp-cross-a'),
    udmStore.checkAndReserveApiIdempotency(ORG, 'payments', 'cross-idem-key-conflict', 'fp-cross-b'),
  ]);
  const statuses = results.map((r) => r.status);
  console.log(`CONFLICT_RESULT:${JSON.stringify(statuses)}`);
  closeDatabase();
}

async function recoveryConcurrent() {
  udmStore.setTenantContext(ORG);
  const requests = approvalStore.getRequests(ORG);
  if (requests.length === 0) {
    console.error('RECOVERY_RESULT:no_approvals_found');
    closeDatabase();
    process.exit(1);
  }
  const approval = requests[0];

  // Pre-create match to simulate post-crash state (financial effect committed)
  const invoices = udmStore.getInvoices().filter((i) => i.organization_id === ORG);
  const payments = udmStore.getPayments().filter((p) => p.organization_id === ORG);
  const inv = invoices[0];
  const pay = payments[0];

  udmStore.insertMatch({
    organization_id: ORG,
    payment_id: pay.id,
    invoice_id: inv.id,
    matched_amount_minor_units: 5000000,
    match_method: 'manual',
    confidence: 1.0,
  });
  udmStore.updateInvoice(inv.id, { status: 'partially_paid' });
  approvalStore.markExecutionResult(approval.id, 'succeeded');

  // Two concurrent recoveries
  const results = await Promise.all([
    executionService.executeApprovedAction(approval.id, {
      userId: 'reviewer',
      organizationId: ORG,
    }),
    executionService.executeApprovedAction(approval.id, {
      userId: 'reviewer',
      organizationId: ORG,
    }),
  ]);
  console.log(`RECOVERY_RESULT:${JSON.stringify(results.map((r) => r.success ? 'success' : 'fail'))}`);
  closeDatabase();
}

async function allocConcurrent() {
  udmStore.setTenantContext(ORG);
  const requests = approvalStore.getRequests(ORG);
  if (requests.length === 0) {
    console.error('ALLOC_RESULT:no_approvals_found');
    closeDatabase();
    process.exit(1);
  }
  const approval = requests[0];

  const invoices = udmStore.getInvoices().filter((i) => i.organization_id === ORG);
  const payments = udmStore.getPayments().filter((p) => p.organization_id === ORG);
  const inv = invoices[0];

  // Two different payments for same invoice - concurrent allocations
  const pay1 = payments[0];
  const pay2 = udmStore.insertPayment({
    organization_id: ORG,
    source_system: 'manual',
    source_id: 'PAY-CROSS-IDEM-2',
    customer_id: inv.customer_id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-02-01',
  });

  // Create two separate approvals for concurrent allocation
  const appr1 = approvalStore.createRequest({
    organization_id: ORG,
    subject_type: 'invoice',
    subject_id: inv.id,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: inv.id,
      payment_id: pay1.id,
      amount_minor_units: 2500000,
      match_method: 'manual',
      idempotency_key: 'cross-alloc-1',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'cross_test',
  });
  approvalStore.approveRequest(appr1.id, 'reviewer');

  const appr2 = approvalStore.createRequest({
    organization_id: ORG,
    subject_type: 'invoice',
    subject_id: inv.id,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: inv.id,
      payment_id: pay2.id,
      amount_minor_units: 2500000,
      match_method: 'manual',
      idempotency_key: 'cross-alloc-2',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'cross_test',
  });
  approvalStore.approveRequest(appr2.id, 'reviewer');

  const results = await Promise.all([
    executionService.executeApprovedAction(appr1.id, {
      userId: 'reviewer',
      organizationId: ORG,
    }),
    executionService.executeApprovedAction(appr2.id, {
      userId: 'reviewer',
      organizationId: ORG,
    }),
  ]);
  console.log(`ALLOC_RESULT:${JSON.stringify(results.map((r) => r.success ? 'success' : 'fail'))}`);
  closeDatabase();
}

async function main() {
  if (scenario === 'init') await init();
  else if (scenario === 'idem-identical-2') await idemIdentical(2);
  else if (scenario === 'idem-identical-10') await idemIdentical(10);
  else if (scenario === 'idem-conflict') await idemConflict();
  else if (scenario === 'recovery-concurrent') await recoveryConcurrent();
  else if (scenario === 'alloc-concurrent') await allocConcurrent();
  else {
    console.error(`Unknown scenario: ${scenario}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
