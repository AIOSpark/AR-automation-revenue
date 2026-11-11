/**
 * Child-process worker for the cross-process concurrency suite.
 *
 * Each invocation is a separate Node.js process opening the same SQLite file,
 * so process-local maps and locks cannot make the assertions pass. The parent
 * script (scripts/test-concurrency.mjs) sets AIOSPARK_DB_PATH before launch.
 */
import fs from 'node:fs';
import { udmStore } from '../src/lib/udm/store';
import { runWithTenant } from '../src/lib/tenant/request-context';
import { closeDatabase, getDurableStatePath, readSnapshotDirect } from '../src/lib/db/durable-repository';

type Payload = {
  ok: boolean;
  mode: string;
  id?: string;
  paymentId?: string;
  matchId?: string;
  counts?: { customers: number; invoices: number; payments: number; matches: number };
  rawCustomers?: number;
  error?: string;
};

const mode = process.env.WORKER_MODE || '';
const orgId = process.env.WORKER_ORG || '';
const customerId = process.env.WORKER_CUSTOMER_ID || '';
const invoiceId = process.env.WORKER_INVOICE_ID || '';
const idempotencyKey = process.env.WORKER_IDEMPOTENCY_KEY || '';
const invoiceNumber = process.env.WORKER_INVOICE_NUMBER || 'INV-CONCURRENT';
const amount = Number(process.env.WORKER_AMOUNT || '100000');
const crashMarker = process.env.WORKER_CRASH_MARKER || '';

function emit(payload: Payload): void {
  process.stdout.write(`${JSON.stringify({ ...payload, dbPath: getDurableStatePath() })}\n`);
}

async function main(): Promise<void> {
  await runWithTenant(orgId, async () => {
    udmStore.setTenantContext(orgId);

    switch (mode) {
      case 'idempotent-invoice': {
        const invoice = udmStore.insertInvoice({
          organization_id: orgId,
          source_system: 'manual',
          source_id: `src_${invoiceNumber}`,
          customer_id: customerId,
          number: invoiceNumber,
          amount_minor_units: 500000,
          currency: 'INR',
          tax_amount_minor_units: 90000,
          issue_date: '2026-10-01',
          due_date: '2026-10-31',
          status: 'open',
          idempotency_key: idempotencyKey,
        });
        emit({ ok: true, mode, id: invoice.id });
        break;
      }

      case 'add-match': {
        const payment = udmStore.insertPayment({
          organization_id: orgId,
          source_system: 'bank_feed',
          source_id: `pay_${invoiceId}_${process.pid}`,
          customer_id: customerId,
          amount_minor_units: amount,
          currency: 'INR',
          date: '2026-10-15',
        });
        const match = udmStore.insertMatch({
          organization_id: orgId,
          payment_id: payment.id,
          invoice_id: invoiceId,
          matched_amount_minor_units: amount,
          match_method: 'deterministic',
        });
        emit({ ok: true, mode, id: match.id, paymentId: payment.id, matchId: match.id });
        break;
      }

      case 'update-invoice': {
        const updated = udmStore.updateInvoice(invoiceId, {
          status: 'partially_paid',
          due_date: process.env.WORKER_DUE_DATE || '2026-12-31',
        });
        emit({ ok: true, mode, id: updated.id });
        break;
      }

      case 'crash-during-mutation': {
        // Kill the process after the mutation is applied to the transaction
        // but before COMMIT. SQLite must discard the uncommitted WAL frames.
        udmStore.transaction(() => {
          const payment = udmStore.insertPayment({
            organization_id: orgId,
            source_system: 'bank_feed',
            source_id: `crash_${process.pid}`,
            customer_id: customerId,
            amount_minor_units: amount,
            currency: 'INR',
            date: '2026-10-20',
          });
          udmStore.insertMatch({
            organization_id: orgId,
            payment_id: payment.id,
            invoice_id: invoiceId,
            matched_amount_minor_units: amount,
            match_method: 'manual',
          });
          if (crashMarker) fs.writeFileSync(crashMarker, payment.id);
          process.kill(process.pid, 'SIGKILL');
          return payment;
        });
        break;
      }

      case 'read-counts': {
        const snapshot = readSnapshotDirect<{ customers?: unknown[] }>('udm');
        emit({
          ok: true,
          mode,
          rawCustomers: snapshot?.customers?.length ?? -1,
          counts: {
            customers: udmStore.getCustomers().length,
            invoices: udmStore.getInvoices().length,
            payments: udmStore.getPayments().length,
            matches: udmStore.getMatches().length,
          },
        });
        break;
      }

      default:
        emit({ ok: false, mode, error: `Unknown worker mode '${mode}'` });
        process.exitCode = 2;
    }
  });
  closeDatabase();
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    emit({ ok: false, mode, error: error instanceof Error ? error.stack || error.message : String(error) });
    process.exit(1);
  });
