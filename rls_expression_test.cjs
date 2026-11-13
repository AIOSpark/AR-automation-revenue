/**
 * Test RLS policy expression evaluation directly.
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
  console.log("=== RLS EXPRESSION TEST ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Create RLS policies
  await pool.query("ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY");
  await pool.query("CREATE POLICY org_select ON udm_payments FOR SELECT USING (organization_id = NULLIF(current_setting('app.current_org_id', true), ''))");
  await pool.query("CREATE POLICY org_insert ON udm_payments FOR INSERT WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), ''))");
  
  // Test 1: Check the expression evaluation directly
  console.log("Test 1 - Direct expression evaluation:");
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT id, organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS match FROM udm_payments");
  r1.rows.forEach(r => {
    console.log("  id=" + r.id + ": match=" + r.match);
  });
  
  // Test 2: SELECT * with org_a context
  console.log("\nTest 2 - SELECT * with org_a context:");
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r2 = await pool.query("SELECT * FROM udm_payments");
  console.log("  rows: " + r2.rows.length + " (expected: 1 if RLS working)");
  
  // Test 3: SELECT * with org_b context
  console.log("\nTest 3 - SELECT * with org_b context:");
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r3 = await pool.query("SELECT * FROM udm_payments");
  console.log("  rows: " + r3.rows.length + " (expected: 0 if RLS blocking org_a)");
  
  // Test 4: Check what the policy USING expression evaluates to per row
  console.log("\nTest 4 - Policy expression per row:");
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r4 = await pool.query("SELECT id, organization_id, organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS eval FROM udm_payments");
  r4.rows.forEach(r => {
    console.log("  id=" + r.id + " org=" + r.organization_id + " eval=" + r.eval);
  });
  
  // Test 5: With org_b
  console.log("\nTest 5 - With org_b context:");
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r5 = await pool.query("SELECT id, organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS eval FROM udm_payments");
  r5.rows.forEach(r => {
    console.log("  id=" + r.id + " org=" + r.organization_id + " eval=" + r.eval);
  });
  
  await pool.end();
}

main();