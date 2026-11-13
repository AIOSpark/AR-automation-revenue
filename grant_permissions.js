const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'aiospark_revenue',
});

async function grantTablePermissions(tableName) {
  const client = await pool.connect();
  try {
    // Grant SELECT, INSERT, UPDATE, DELETE to test_org_a and test_org_b
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tableName} TO test_org_a`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tableName} TO test_org_b`);
    console.log(`  ✅ Granted permissions on ${tableName} to test_org_a and test_org_b`);
  } catch (err) {
    console.log(`  ⚠️ Could not grant permissions on ${tableName}: ${err.message}`);
  } finally {
    client.release();
  }
}

async function grantSequencePermissions() {
  // Grant usage on the sequence for UUID generation
  try {
    await client.query('GRANT USAGE ON SEQUENCE global_seq TO test_org_a');
    await client.query('GRANT USAGE ON SEQUENCE global_seq TO test_org_b');
    console.log('  ✅ Granted USAGE on global_seq to test_org_a and test_org_b');
  } catch (err) {
    console.log(`  ⚠️ Could not grant sequence permissions: ${err.message}`);
  }
}

async function grantRls() {
  // The RLS policies should already be in place, but let's ensure they work
  try {
    // Test that the policy function works
    const result = await client.query(
      "SELECT current_setting('app.current_org_id', true) AS current_org"
    );
    console.log('  ✅ current_setting function works:', result.rows[0]);
  } catch (err) {
    console.log(`  ⚠️ current_setting issue: ${err.message}`);
  }
}

async function main() {
  console.log('Granting permissions to test users...\n');
  
  // Grant permissions on all new payment domain tables
  await grantTablePermissions('udm_payment_allocations');
  await grantTablePermissions('udm_payment_refunds');
  await grantTablePermissions('udm_payment_reversals');
  await grantTablePermissions('udm_ar_reconciliation');
  await grantTablePermissions('udm_payments');
  await grantTablePermissions('udm_invoices');
  await grantTablePermissions('udm_payment_matches');
  
  // Grant permissions on existing tables
  await grantTablePermissions('udm_idempotency_keys');
  await grantTablePermissions('audit_events');
  await grantTablePermissions('auth_organizations');
  await grantTablePermissions('auth_users');
  
  // Grant sequence permissions if needed
  await grantSequencePermissions();
  
  // Verify RLS policies
  await grantRls();
  
  console.log('\n✅ Permission granting complete!');
  pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});