/**
 * Test RLS as test_org_a user directly.
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
  console.log("=== RLS AS test_org_a USER ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments");
  await pool.query("DELETE FROM udm_invoices");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Test 1: Check current_setting
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT current_setting('app.current_org_id', true)");
  console.log("Test 1 - current_setting with org_a: " + r1.rows[0].current_setting);
  
  // Test 2: Direct expression
  const r2 = await pool.query("SELECT id, organization_id = NULLIF(current_setting(app.current_org_id, true), '') AS eval FROM udm_payments");
  console.log("Test 2 - Direct eval:"); r2.rows.forEach(r => {
    console.log("  id=" + r.id + " org=" + r.organization_id + " eval=" + r.eval);
  });
  
  // Test 3: SELECT *
  const r3 = await pool.query("SELECT * FROM udm_payments");
  console.log("Test 3 - SELECT * with org_a: rows=" + r3.rows.length);
  
  // Test 4: SELECT WHERE org_a
  const r4 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("Test 4 - COUNT WHERE org_a: " + r4.rows[0].cnt);
  
  // Test 5: SELECT WHERE org_b
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r5 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("Test 5 - COUNT WHERE org_a with org_b: " + r5.rows[0].cnt + " (expected: 0 if RLS working)");
  
  // Test 6: INSERT cross-tenant
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_b', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log("Test 6 - Cross-tenant INSERT: ALLOWED (unexpected)");
  } catch (e) {
    console.log("Test 6 - Cross-tenant INSERT: BLOCKED by RLS");
  }
  
  // Test 7: INSERT own
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log("Test 7 - Own INSERT: ALLOWED (expected)");
  } catch (e) {
    console.log("Test 7 - Own INSERT: BLOCKED - " + e.message.substring(0, 30));
  }
  
  // Test 8: DELETE own
  try {
    await pool.query("DELETE FROM udm_payments WHERE id = 'pay_a'");
    const r7 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_a'");
    console.log("Test 8 - DELETE own: cnt=" + r7.rows[0].cnt + " (expected: 0 if blocked, 1 if allowed)");
  } catch (e) {
    console.log("Test 8 - DELETE own: BLOCKED - " + e.message.substring(0, 30));
  }
  
  await pool.end();
}

main();