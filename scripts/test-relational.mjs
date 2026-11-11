// HIGH-009 relational migration verification.
// Uses a real SQLite file and a legacy JSON snapshot to exercise migration.

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-relational-${process.pid}.sqlite`);
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';

const {
  closeDatabase,
  getDatabase,
  getSchemaVersion,
  writeSnapshot,
} = await import('../src/lib/db/durable-repository.ts');
const {
  backfillUdmFromSnapshot,
  readUdmRelationalState,
} = await import('../src/lib/db/relational-repository.ts');

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ [REL_PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ❌ [REL_FAIL] ${name}: ${error?.message || String(error)}`);
  }
}

const now = new Date().toISOString();
const legacy = {
  customers: [
    {
      id: 'cust_rel',
      organization_id: 'org_rel',
      source_system: 'csv',
      source_id: 'C-1',
      name: 'Relational Customer',
      credit_limit_minor_units: 500000,
      currency: 'INR',
      payment_terms_days: 30,
      created_at: now,
      updated_at: now,
    },
  ],
  contacts: [],
  invoices: [
    {
      id: 'inv_rel',
      organization_id: 'org_rel',
      source_system: 'csv',
      source_id: 'INV-1',
      customer_id: 'cust_rel',
      number: 'INV-1',
      amount_minor_units: 125000,
      currency: 'INR',
      tax_amount_minor_units: 0,
      issue_date: now.slice(0, 10),
      due_date: now.slice(0, 10),
      status: 'open',
      created_at: now,
      updated_at: now,
    },
  ],
  payments: [
    {
      id: 'pay_rel',
      organization_id: 'org_rel',
      source_system: 'csv',
      source_id: 'PAY-1',
      customer_id: 'cust_rel',
      amount_minor_units: 50000,
      currency: 'INR',
      date: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    },
  ],
  matches: [
    {
      id: 'match_rel',
      organization_id: 'org_rel',
      payment_id: 'pay_rel',
      invoice_id: 'inv_rel',
      matched_amount_minor_units: 50000,
      created_at: now,
    },
  ],
  creditNotes: [
    {
      id: 'cn_rel',
      organization_id: 'org_rel',
      source_system: 'csv',
      source_id: 'CN-1',
      customer_id: 'cust_rel',
      invoice_id: 'inv_rel',
      amount_minor_units: 10000,
      currency: 'INR',
      date: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    },
  ],
  creditAllocations: [
    {
      id: 'ca_rel',
      organization_id: 'org_rel',
      credit_note_id: 'cn_rel',
      invoice_id: 'inv_rel',
      allocated_amount_minor_units: 10000,
      status: 'allocated',
      created_at: now,
      updated_at: now,
    },
  ],
  disputes: [],
  disputeEvidences: [],
  exceptions: [],
  bankTransactions: [],
  idempotencyKeys: [],
  apiIdempotencyKeys: [],
};

console.log('\n==========================================');
console.log('RUNNING AIOSPARK HIGH-009 RELATIONAL SUITE');
console.log('==========================================\n');

await check('Schema version 4 is recorded', () => {
  assert.equal(getSchemaVersion(), 4);
});

await check('Legacy JSON snapshot backfills into relational tables', () => {
  writeSnapshot('udm', legacy);
  assert.equal(readUdmRelationalState(), null);
  assert.equal(backfillUdmFromSnapshot(), true);
  const state = readUdmRelationalState();
  assert(state);
  assert.equal(state.customers[0].id, 'cust_rel');
  assert.equal(state.invoices[0].id, 'inv_rel');
  assert.equal(state.payments[0].id, 'pay_rel');
  assert.equal(state.matches[0].id, 'match_rel');
  assert.equal(state.creditNotes[0].id, 'cn_rel');
  assert.equal(state.creditAllocations[0].id, 'ca_rel');
  assert.equal(backfillUdmFromSnapshot(), false, 'backfill must be idempotent');
});

await check('Foreign key from invoice to customer is enforced', () => {
  const db = getDatabase();
  assert.throws(
    () => db.exec(`
      INSERT INTO udm_invoices(
        id, organization_id, customer_id, source_system, source_id,
        amount_minor_units, tax_amount_minor_units, status, issue_date, due_date, payload
      ) VALUES ('inv_bad_fk','org_rel','cust_missing','csv','INV-BAD',100,0,'open','2026-01-01','2026-01-01','{}')
    `),
    /FOREIGN KEY/i
  );
});

await check('CHECK constraints reject negative amounts and invalid statuses', () => {
  const db = getDatabase();
  assert.throws(
    () => db.exec(`
      INSERT INTO udm_invoices(
        id, organization_id, customer_id, source_system, source_id,
        amount_minor_units, tax_amount_minor_units, status, issue_date, due_date, payload
      ) VALUES ('inv_bad_amount','org_rel','cust_rel','csv','INV-BAD2',-1,0,'open','2026-01-01','2026-01-01','{}')
    `),
    /CHECK/i
  );
  assert.throws(
    () => db.exec(`
      INSERT INTO udm_invoices(
        id, organization_id, customer_id, source_system, source_id,
        amount_minor_units, tax_amount_minor_units, status, issue_date, due_date, payload
      ) VALUES ('inv_bad_status','org_rel','cust_rel','csv','INV-BAD3',100,0,'nonsense','2026-01-01','2026-01-01','{}')
    `),
    /CHECK/i
  );
});

await check('Match and allocation CHECK constraints reject zero values', () => {
  const db = getDatabase();
  assert.throws(
    () => db.exec(`
      INSERT INTO udm_payment_matches(id, organization_id, payment_id, invoice_id, matched_amount_minor_units, payload)
      VALUES ('match_bad','org_rel','pay_rel','inv_rel',0,'{}')
    `),
    /CHECK/i
  );
  assert.throws(
    () => db.exec(`
      INSERT INTO udm_credit_allocations(
        id, organization_id, credit_note_id, invoice_id, allocated_amount_minor_units, status, payload
      ) VALUES ('ca_bad','org_rel','cn_rel','inv_rel',0,'allocated','{}')
    `),
    /CHECK/i
  );
});

await check('Primary-key identity uniqueness is enforced', () => {
  const db = getDatabase();
  assert.throws(
    () => db.exec(`
      INSERT INTO udm_customers(
        id, organization_id, source_system, source_id, name,
        credit_limit_minor_units, currency, payment_terms_days, payload
      ) VALUES ('cust_rel','org_rel','csv','C-DUP','Duplicate',0,'INR',30,'{}')
    `),
    /UNIQUE|PRIMARY KEY/i
  );
});

await check('UDM writes update relational rows authoritatively', async () => {
  const { udmStore } = await import('../src/lib/udm/store.ts');
  udmStore.setTenantContext('org_rel');
  const customer = udmStore.insertCustomer({
    organization_id: 'org_rel',
    source_system: 'manual',
    source_id: 'C-2',
    name: 'Second Customer',
    credit_limit_minor_units: 1000,
    currency: 'INR',
    payment_terms_days: 15,
  });
  const state = readUdmRelationalState();
  assert(state);
  assert(state.customers.some((row) => row.id === customer.id));
  const count = getDatabase().prepare('SELECT COUNT(*) AS c FROM udm_customers').get();
  assert.equal(count.c, 2);
});

await check('Invalid UDM write rolls back relational and snapshot state', async () => {
  const { udmStore } = await import('../src/lib/udm/store.ts');
  udmStore.setTenantContext('org_rel');
  const before = readUdmRelationalState();
  assert.throws(() =>
    udmStore.insertInvoice({
      organization_id: 'org_rel',
      source_system: 'manual',
      source_id: 'INV-FAIL',
      customer_id: 'cust_missing',
      number: 'INV-FAIL',
      amount_minor_units: 100,
      currency: 'INR',
      tax_amount_minor_units: 0,
      issue_date: now.slice(0, 10),
      due_date: now.slice(0, 10),
      status: 'open',
    })
  );
  const after = readUdmRelationalState();
  assert.equal(after.invoices.length, before.invoices.length);
});

console.log(`\nRELATIONAL SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
closeDatabase();
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.rmSync(`${DB}${suffix}`, { force: true });
  } catch {
    // Best-effort cleanup.
  }
}
if (failed > 0) process.exit(1);
