/**
 * Simple RLS check as test_org_a user.
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
  // Clean state
  await pool.query("DELETE FROM udm_payments");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Test 1: With org_a context
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("With org_a context, COUNT WHERE org_a: " + r1.rows[0].cnt);
  
  // Test 2: With org_b context
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("With org_b context, COUNT WHERE org_a: " + r2.rows[0].cnt + " (expected: 0 if RLS working)");
  
  // Test 3: Reset context
  await pool.query("RESET app.current_org_id");
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("After RESET, COUNT WHERE org_a: " + r3.rows[0].cnt + " (expected: 0 if fails closed)");
  
  await pool.end();
}

main();