const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'aiospark_revenue',
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Setting up payment domain database...\n');

  // Step 1: Create base udm_payments table (if not exists)
  console.log('Step 1: Creating base udm_payments table...');
  await query(`
    CREATE TABLE IF NOT EXISTS udm_payments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_id TEXT NOT NULL,
      amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
      currency TEXT NOT NULL CHECK (length(currency) = 3),
      date TIMESTAMPTZ NOT NULL,
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('authorized','captured','pending','refunded','reversed','failed')),
      payment_type TEXT NOT NULL DEFAULT 'ar_customer' CHECK (payment_type IN ('saas_subscription','ar_customer','bank_transfer','razorpay_payment','manual')),
      payment_method TEXT,
      payment_source TEXT,
      capture_timestamp TIMESTAMPTZ,
      authorization_timestamp TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  ✅ udm_payments table created/verified');

  // Step 2: Create base udm_invoices table
  console.log('Step 2: Creating base udm_invoices table...');
  await query(`
    CREATE TABLE IF NOT EXISTS udm_invoices (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_id TEXT NOT NULL,
      amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
      currency TEXT NOT NULL CHECK (length(currency) = 3),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','cancelled')),
      issue_date TIMESTAMPTZ NOT NULL,
      due_date TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  ✅ udm_invoices table created/verified');

  // Step 3: Create udm_payment_matches table (pre-existing, for 1:1 matching)
  console.log('Step 3: Creating udm_payment_matches table...');
  await query(`
    CREATE TABLE IF NOT EXISTS udm_payment_matches (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES udm_payments(id),
      invoice_id TEXT NOT NULL REFERENCES udm_invoices(id),
      matched_amount_minor_units INTEGER NOT NULL,
      match_status TEXT NOT NULL DEFAULT 'matched' CHECK (match_status IN ('matched','partial','unmatched')),
      matched_at TIMESTAMPTZ DEFAULT NOW(),
      external_transaction_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  ✅ udm_payment_matches table created/verified');

  // Step 4: Migration 003 - udm_payment_allocations
  console.log('Step 4: Applying migration 003 - udm_payment_allocations...');
  await query(`
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
    CREATE POLICY org_isolation_select ON udm_payment_allocations FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_insert ON udm_payment_allocations FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_update ON udm_payment_allocations FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true));
    CREATE POLICy org_isolation_delete ON udm_payment_allocations FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));
  `);
  console.log('  ✅ udm_payment_allocations table created');

  // Step 5: Migration 004 - udm_payment_refunds
  console.log('Step 5: Applying migration 004 - udm_payment_refunds...');
  await query(`
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
  `);
  console.log('  ✅ udm_payment_refunds table created');

  // Step 6: Migration 005 - udm_payment_reversals
  console.log('Step 6: Applying migration 005 - udm_payment_reversals...');
  await query(`
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
  `);
  console.log('  ✅ udm_payment_reversals table created');

  // Step 7: Migration 006 - udm_ar_reconciliation
  console.log('Step 7: Applying migration 006 - udm_ar_reconciliation...');
  await query(`
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
  `);
  console.log('  ✅ udm_ar_reconciliation table created');

  // Step 8: Enhance udm_payments with new columns (migration 007)
  console.log('Step 8: Applying migration 007 - enhancing udm_payments...');
  // payment_type already added above, but let's add the rest
  try {
    await query(`ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_method TEXT`);
    console.log('  ✅ payment_method column added');
  } catch (e) {
    console.log('  ⚠️ payment_method may already exist');
  }
  try {
    await query(`ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_source TEXT`);
    console.log('  ✅ payment_source column added');
  } catch (e) {
    console.log('  ⚠️ payment_source may already exist');
  }
  try {
    await query(`ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('authorized','captured','pending','refunded','reversed','failed'))`);
    console.log('  ✅ status column added/verified');
  } catch (e) {
    console.log('  ⚠️ status may already exist');
  }
  try {
    await query(`ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS capture_timestamp TIMESTAMPTZ`);
    console.log('  ✅ capture_timestamp column added');
  } catch (e) {
    console.log('  ⚠️ capture_timestamp may already exist');
  }
  try {
    await query(`ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS authorization_timestamp TIMESTAMPTZ`);
    console.log('  ✅ authorization_timestamp column added');
  } catch (e) {
    console.log('  ⚠️ authorization_timestamp may already exist');
  }

  // Add RLS policy to udm_payments if not already present
  try {
    await query(`
      ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY;
      CREATE POLICy org_isolation_select ON udm_payments FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));
      CREATE POLICy org_isolation_insert ON udm_payments FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));
      CREATE POLICy org_isolation_update ON udm_payments FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true));
      CREATE POLICy org_isolation_delete ON udm_payments FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));
    `);
    console.log('  ✅ RLS policies added to udm_payments');
  } catch (e) {
    console.log('  ⚠️ RLS policies may already exist on udm_payments');
  }

  console.log('\n✅ All database setup complete!');
  pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});