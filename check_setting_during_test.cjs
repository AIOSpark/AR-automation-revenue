/**
 * Check current_setting during RLS test.
 */

const { Pool } = require("pg");
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "",
  database: "aiospark_revenue",
});

async function main() {
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Check current_setting without SET
  const r1 = await pool.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS org_val");
  console.log("Without SET: " + r1.rows[0].org_val);
  
  // Set org_a context
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r2 = await pool.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS org_val");
  console.log("With org_a: " + r2.rows[0].org_val);
  
  // Set org_b context
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r3 = await pool.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS org_val");
  console.log("With org_b: " + r3.rows[0].org_val);
  
  // Reset
  await pool.query("RESET app.current_org_id");
  const r4 = await pool.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS org_val");
  console.log("After RESET: " + r4.rows[0].org_val);
  
  await pool.end();
}

main();