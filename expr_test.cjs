/**
 * Test RLS expression evaluation with test_org_a connection.
 */

const { Pool } = require("pg");
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "test_org_a",
  password: "test_org_a_pwd",
  database: "aiospark_revenue",
});

async function main() {
  console.log("=== EXPRESSION TEST ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Test 1: Check current_setting
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS org_val");
  console.log("Test 1 - current_setting with org_a: " + r1.rows[0].org_val);
  
  // Test 2: Direct expression per row
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r2 = await pool.query("SELECT id, organization_id, organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS eval FROM udm_payments");
  console.log("\nTest 2 - Direct expression per row with org_a:");
  r2.rows.forEach(r => {
    console.log("  id=" + r.id + " org=" + r.organization_id + " eval=" + r.eval);
  });
  
  // Test 3: With org_b context
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r3 = await pool.query("SELECT id, organization_id, organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS eval FROM udm_payments");
  console.log("\nTest 3 - Direct expression per row with org_b:");
  r3.rows.forEach(r => {
    console.log("  id=" + r.id + " org=" + r.organization_id + " eval=" + r.eval);
  });
  
  // Test 4: Can test_org_a see pay_b?
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r4 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
  console.log("\nTest 4 - COUNT WHERE org_b with org_a context: " + r4.rows[0].cnt + " (expected: 0 if RLS working)");
  
  // Test 5: Can test_org_b see pay_a?
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r5 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("Test 5 - COUNT WHERE org_a with org_b context: " + r5.rows[0].cnt + " (expected: 0 if RLS working)");
  
  pool.end();
}

main();