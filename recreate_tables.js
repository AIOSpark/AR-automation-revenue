const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'aiospark_revenue',
});

async function dropTable(tableName) {
  const client = await pool.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
    console.log(`  ✅ Dropped ${tableName}`);
  } catch (err) {
    console.log(`  ⚠️ Could not drop ${tableName}: ${err.message}`);
  } finally {
    client.release();
  }
}

async function createTable(tableName, sql) {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`  ✅ Created ${tableName}`);
  } catch (err) {
    console.log(`  ❌ Could not create ${tableName}: ${err.message}`);
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Recreating payment domain tables with TEXT primary keys...\n');
  
  // Step 1: Drop new tables if they exist
  console.log('Step 1: Dropping existing tables...');
  await dropTable('udm_payment_allocations');
  await dropTable('udm_payment_refunds');
  await dropTable('udm_payment_reversals');
  await dropTable('udm_ar_reconciliation');
  
  // Step 2: Recreate udm_payments with enhanced columns and TEXT primary key
  console.log('\nStep 2: Recreating udm_payments...');
  await createTable('udm_payments', `
    CREATE TABLE udm_payments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_id TEXT NOT NULL,
      amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
      currency TEXT NOT NULL CHECK (length(currency) = 3),
      date TIMESTAMPTZ NOT NULL,
      reference TEXT,
      payment_type TEXT NOT NULL DEFAULT 'ar_customer' CHECK (payment_type IN ('saas_subscription','ar_customer','bank_transfer','razorpay_payment','manual')),
      payment_method TEXT,
      payment_source TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('authorized','captured','pending','refunded','reversed','failed')),
      capture_timestamp TIMESTAMPTZ,
      authorization_timestamp TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  
  // Add RLS to udm_payments
  try {
    await pool.query('ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY');
    await pool.query("CREATE POLICy org_isolation_select ON udm_payments FOR SELECT USING (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_insert ON udm_payments FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_update ON udm_payments FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_delete ON udm_payments FOR DELETE USING (organization_id = current_setting('app.current_org_id', true))");
    console.log('  ✅ RLS policies added to udm_payments');
  } catch (err) {
    console.log(`  ⚠️ RLS setup issue: ${err.message}`);
  }
  
  // Step 3: Recreate udm_invoices
  console.log('\nStep 3: Recreating udm_invoices...');
  await createTable('udm_invoices', `
    CREATE TABLE udm_invoices (
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
    )
  `);
  
  // Add RLS to udm_invoices
  try {
    await pool.query('ALTER TABLE udm_invoices ENABLE ROW LEVEL SECURITY');
    await pool.query("CREATE POLICy org_isolation_select ON udm_invoices FOR SELECT USING (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_insert ON udm_invoices FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_update ON udm_invoices FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_delete ON udm_invoices FOR DELETE USING (organization_id = current_setting('app.current_org_id', true))");
    console.log('  ✅ RLS policies added to udm_invoices');
  } catch (err) {
    console.log(`  ⚠️ RLS setup issue: ${err.message}`);
  }
  
  // Step 4: Create udm_payment_allocations (migration 003)
  console.log('\nStep 4: Creating udm_payment_allocations (migration 003)...');
  await createTable('udm_payment_allocations', `
    CREATE TABLE udm_payment_allocations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES udm_payments(id),
      invoice_id TEXT NOT NULL REFERENCES udm_invoices(id),
      allocated_amount_minor_units INTEGER NOT NULL CHECK (allocated_amount_minor_units > 0),
      status TEXT NOT NULL CHECK (status IN ('allocated','partial','reversed')),
      allocation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor TEXT NOT NULL,
      reversal_reference TEXT,
      payload JSONB NOT NULL DEFAULT '{}'
    )
  `);
  
  // Add indexes
  try {
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_allocations_org_status ON udm_payment_allocations (organization_id, status)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_allocations_org_payment ON udm_payment_allocations (organization_id, payment_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_invoice ON udm_payment_allocations (payment_id, invoice_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_org ON udm_payment_allocations (invoice_id, organization_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_allocated ON udm_payment_allocations (payment_id, status, allocated_amount_minor_units)");
    
    // Add RLS
    await pool.query('ALTER TABLE udm_payment_allocations ENABLE ROW LEVEL SECURITY');
    await pool.query("CREATE POLICy org_isolation_select ON udm_payment_allocations FOR SELECT USING (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_insert ON udm_payment_allocations FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_update ON udm_payment_allocations FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_delete ON udm_payment_allocations FOR DELETE USING (organization_id = current_setting('app.current_org_id', true))");
    console.log('  ✅ udm_payment_allocations created with indexes and RLS');
  } catch (err) {
    console.log(`  ⚠️ Allocations indexes/RLS issue: ${err.message}`);
  }
  
  // Step 5: Create udm_payment_refunds (migration 004)
  console.log('\nStep 5: Creating udm_payment_refunds (migration 004)...');
  await createTable('udm_payment_refunds', `
    CREATE TABLE udm_payment_refunds (
      id TEXT PRIMARY KEY,
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
    )
  `);
  
  // Add indexes and RLS
  try {
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_refunds_org ON udm_payment_refunds (organization_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON udm_payment_refunds (payment_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_refunds_org_status ON udm_payment_refunds (organization_id, status)");
    
    await pool.query('ALTER TABLE udm_payment_refunds ENABLE ROW LEVEL SECURITY');
    await pool.query("CREATE POLICy org_isolation_select ON udm_payment_refunds FOR SELECT USING (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_insert ON udm_payment_refunds FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_update ON udm_payment_refunds FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_delete ON udm_payment_refunds FOR DELETE USING (organization_id = current_setting('app.current_org_id', true))");
    console.log('  ✅ udm_payment_refunds created with indexes and RLS');
  } catch (err) {
    console.log(`  ⚠️ Refunds indexes/RLS issue: ${err.message}`);
  }
  
  // Step 6: Create udm_payment_reversals (migration 005)
  console.log('\nStep 6: Creating udm_payment_reversals (migration 005)...');
  await createTable('udm_payment_reversals', `
    CREATE TABLE udm_payment_reversals (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES udm_payments(id),
      reversal_amount_minor_units INTEGER NOT NULL CHECK (reversal_amount_minor_units > 0),
      reversal_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT,
      reversed_by TEXT,
      original_transaction_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'
    )
  `);
  
  // Add indexes and RLS
  try {
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_reversals_org ON udm_payment_reversals (organization_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_payment_reversals_payment ON udm_payment_reversals (payment_id)");
    
    await pool.query('ALTER TABLE udm_payment_reversals ENABLE ROW LEVEL SECURITY');
    await pool.query("CREATE POLICy org_isolation_select ON udm_payment_reversals FOR SELECT USING (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_insert ON udm_payment_reversals FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_update ON udm_payment_reversals FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_delete ON udm_payment_reversals FOR DELETE USING (organization_id = current_setting('app.current_org_id', true))");
    console.log('  ✅ udm_payment_reversals created with indexes and RLS');
  } catch (err) {
    console.log(`  ⚠️ Reversals indexes/RLS issue: ${err.message}`);
  }
  
  // Step 7: Create udm_ar_reconciliation (migration 006)
  console.log('\nStep 7: Creating udm_ar_reconciliation (migration 006)...');
  await createTable('udm_ar_reconciliation', `
    CREATE TABLE udm_ar_reconciliation (
      id TEXT PRIMARY KEY,
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
    )
  `);
  
  // Add indexes and RLS
  try {
    await pool.query("CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_org ON udm_ar_reconciliation (organization_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_payment ON udm_ar_reconciliation (payment_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_match_status ON udm_ar_reconciliation (match_status, organization_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_external ON udm_ar_reconciliation (external_transaction_id)");
    
    await pool.query('ALTER TABLE udm_ar_reconciliation ENABLE ROW LEVEL SECURITY');
    await pool.query("CREATE POLICy org_isolation_select ON udm_ar_reconciliation FOR SELECT USING (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_insert ON udm_ar_reconciliation FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_update ON udm_ar_reconciliation FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true)) WITH CHECK (organization_id = current_setting('app.current_org_id', true))");
    await pool.query("CREATE POLICy org_isolation_delete ON udm_ar_reconciliation FOR DELETE USING (organization_id = current_setting('app.current_org_id', true))");
    console.log('  ✅ udm_ar_reconciliation created with indexes and RLS');
  } catch (err) {
    console.log(`  ⚠️ Reconciliation indexes/RLS issue: ${err.message}`);
  }
  
  console.log('\n✅ Table recreation complete!');
  pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});