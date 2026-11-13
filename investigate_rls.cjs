/**
 * Investigate why RLS policies aren't blocking cross-tenant operations
 */

const { Pool } = require("pg");
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'test_org_a',
  password: 'test_org_a_pwd',
  database: 'aiospark_revenue',
});

async function main() {
  console.log('=== INVESTIGATING RLS POLICY EVALUATION ===\n');
  
  // First, ensure clean state
  await pool.query("SET app.current_org_id = 'test_org_a'");
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  // Check the policy details
  console.log('=== Policy details on udm_payments ===');
  const polResult = await pool.query(
    "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname"
  );
  polResult.rows.forEach(p => {
    console.log('Policy: ' + p.polname + ' (' + p.polcmd + ')');
    console.log('  polqual: ' + (p.polqual ? 'present' : 'null'));
    console.log('  polwithcheck: ' + (p.polwithcheck ? 'present' : 'null'));
  });
  
  // Test: What does current_setting return in this session?
  console.log('\n=== current_setting behavior ===');
  // Set the org context
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const cfg1 = await pool.query("SHOW app.current_org_id");
  console.log('After SET test_org_a:', cfg1.rows[0].show);
  
  // Now switch context and check
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const cfg2 = await pool.query("SHOW app.current_org_id");
  console.log('After SET test_org_b:', cfg2.rows[0].show);
  
  // Go back
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const cfg3 = await pool.query("SHOW app.current_org_id");
  console.log('After SET test_org_a:', cfg3.rows[0].show);
  
  // Test: Can test_org_a see test_org_b's payments without RLS filtering?
  await pool.query("DELETE FROM udm_payments WHERE organization_id = 'test_org_b'");
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Check with test_org_a context - should see 0 if RLS works, 1 if not
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
  console.log('\nWith org_id=test_org_a, counting test_org_b payments:', r1.rows[0].cnt);
  
  // Check with test_org_b context - should see 1
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
  console.log('With org_id=test_org_b, counting test_org_b payments:', r2.rows[0].cnt);
  
  // Now test INSERT cross-tenant
  await pool.query("SET app.current_org_id = 'test_org_a'");
  await pool.query("DELETE FROM udm_payments WHERE id = 'pay_cross_test'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross_test', 'test_org_b', 'cust_test', 'manual', 'manual_test', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross_test'");
    console.log('\nCross-tenant INSERT (org_a inserting org_b payment): count=' + r3.rows[0].cnt + (r3.rows[0].cnt === '0' ? ' BLOCKED' : ' ALLOWED'));
  } catch (e) {
    console.log('\nCross-tenant INSERT error: ' + e.message.substring(0, 80));
    const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross_test'");
    console.log('Count after error: ' + r3.rows[0].cnt);
  }
  
  // Clean up
  await pool.query("SET app.current_org_id = 'test_org_b'");
  await pool.query("DELETE FROM udm_payments WHERE id = 'pay_b'");
  await pool.query("SET app.current_org_id = 'test_org_a'");
  
  console.log('\n=== INVESTIGATION COMPLETE ===');
}

main();