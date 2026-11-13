const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'aiospark_revenue',
});

async function applyMigration(migrationSql, migrationName) {
  const client = await pool.connect();
  try {
    console.log(`Applying migration: ${migrationName}...`);
    await client.query('BEGIN');
    await client.query(migrationSql);
    await client.query('COMMIT');
    console.log('  ✅ Applied successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.log(`  ❌ Failed: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  // Migration 003: udm_payment_allocations
  await applyMigration(`
    CREATE TABLE IF NOT EXISTS udm_payment_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES udm_payments(id),
      invoice_id TEXT NOT NULL REFERENCES udm_invoices(id),
      allocated_amount_minor_units INTEGER NOT NULL CHECK (allocated_amount_minor_units > 0),
      status TEXT NOT NULL CHECK (status IN ('allocated','partial','reversed')),
      allocation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor TEXT NOT NULL,
      reversal_reference UUID,
      payload JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_org_status ON udm_payment_allocations (organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_org_payment ON udm_payment_allocations (organization_id, payment_id);
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_invoice ON udm_payment_allocations (payment_id, invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_org ON udm_payment_allocations (invoice_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_allocated ON udm_payment_allocations (payment_id, status, allocated_amount_minor_units);
    ALTER TABLE udm_payment_allocations ENABLE ROW LEVEL SECURITY;
    CREATE POLICy org_isolation_select ON udm_payment_allocations FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_insert ON udm_payment_allocations FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_update ON udm_payment_allocations FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_delete ON udm_payment_allocations FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));
  `, '003_create_payment_allocations');

  // Migration 004: udm_payment_refunds
  await applyMigration(`
    CREATE TABLE IF NOT EXISTS udm_payment_refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES udm_payments(id),
      refund_amount_minor_units INTEGER NOT NULL CHECK (refund_amount_minor_units > 0),
      currency TEXT NOT NULL,
      refund_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL CHECK (status IN ('processed','partial','failed')),
      reason TEXT,
      refunded_by TEXT,
      original_transaction_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_payment_refunds_org ON udm_payment_refunds (organization_id);
    CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON udm_payment_refunds (payment_id);
    CREATE INDEX IF NOT EXISTS idx_payment_refunds_org_status ON udm_payment_refunds (organization_id, status);
    ALTER TABLE udm_payment_refunds ENABLE ROW LEVEL SECURITY;
    CREATE POLICy org_isolation_select ON udm_payment_refunds FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_insert ON udm_payment_refunds FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_update ON udm_payment_refunds FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_delete ON udm_payment_refunds FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));
  `, '004_create_payment_refunds');

  // Migration 005: udm_payment_reversals
  await applyMigration(`
    CREATE TABLE IF NOT EXISTS udm_payment_reversals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES udm_payments(id),
      reversal_amount_minor_units INTEGER NOT NULL CHECK (reversal_amount_minor_units > 0),
      reversal_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT,
      reversed_by TEXT,
      original_transaction_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_payment_reversals_org ON udm_payment_reversals (organization_id);
    CREATE INDEX IF NOT EXISTS idx_payment_reversals_payment ON udm_payment_reversals (payment_id);
    ALTER TABLE udm_payment_reversals ENABLE ROW LEVEL SECURITY;
    CREATE POLICy org_isolation_select ON udm_payment_reversals FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_insert ON udm_payment_reversals FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_update ON udm_payment_reversals FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_delete ON udm_payment_reversals FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));
  `, '005_create_payment_reversals');

  // Migration 006: udm_ar_reconciliation
  await applyMigration(`
    CREATE TABLE IF NOT EXISTS udm_ar_reconciliation (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES udm_payments(id),
      external_transaction_id TEXT,
      amount_discrepancy_minor_units INTEGER,
      currency_discrepancy TEXT,
      match_status TEXT NOT NULL CHECK (match_status IN ('matched','partial','unmatched')),
      reason TEXT,
      reviewer TEXT,
      review_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_org ON udm_ar_reconciliation (organization_id);
    CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_payment ON udm_ar_reconciliation (payment_id);
    CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_match_status ON udm_ar_reconciliation (match_status, organization_id);
    CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_external ON udm_ar_reconciliation (external_transaction_id);
    ALTER TABLE udm_ar_reconciliation ENABLE ROW LEVEL SECURITY;
    CREATE POLICy org_isolation_select ON udm_ar_reconciliation FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_insert ON udm_ar_reconciliation FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_update ON udm_ar_reconciliation FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_delete ON udm_ar_reconciliation FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));
  `, '006_create_ar_reconciliation');

  // Migration 007: Enhance udm_payments table
  await applyMigration(`
    ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'ar_customer' CHECK (payment_type IN ('saas_subscription', 'ar_customer', 'bank_transfer', 'razorpay_payment', 'manual'));
    ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_method TEXT;
    ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_source TEXT;
    ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('authorized','captured','pending','refunded','reversed','failed'));
    ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS capture_timestamp TIMESTAMPTZ;
    ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS authorization_timestamp TIMESTAMPTZ;
    ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY;
    CREATE POLICy org_isolation_select ON udm_payments FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_insert ON udm_payments FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_update ON udm_payments FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_delete ON udm_payments FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));
  `, '007_enhance_payments_table');

  console.log('\n✅ All migrations applied successfully!');
  pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});