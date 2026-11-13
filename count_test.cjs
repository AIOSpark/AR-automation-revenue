/**
 * Test RLS with COUNT queries using test_org_a connection.
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
  console.log("=== COUNT TEST ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  let passed = 0;
  let total = 0;
  
  // Test 1: org_a can read own payment
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("Test 1 - org_a can read own payment: cnt=" + r1.rows[0].cnt);
  if (r1.rows[0].cnt > 0) { passed++; console.log("  PASS"); }
  else { console.log("  FAIL"); }
  
  // Test 2: org_b cannot read org_a's payment
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("Test 2 - org_b cannot read org_a's payment: cnt=" + r2.rows[0].cnt + " (expected: 0)");
  if (r2.rows[0].cnt === "0") { passed++; console.log("  PASS - RLS blocking cross-tenant SELECT"); }
  else { console.log("  FAIL - RLS not blocking"); }
  
  // Test 3: cross-tenant INSERT blocked
  total++;
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log("Test 3 - cross-tenant INSERT: ALLOWED (unexpected)");
  } catch (e) {
    passed++;
    console.log("Test 3 - cross-tenant INSERT: BLOCKED by RLS");
  }
  
  // Test 4: own INSERT allowed
  total++;
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log("Test 4 - own INSERT: ALLOWED (expected)");
    passed++; // Actually allow since it's own organization
  } catch (e) {
    console.log("Test 4 - own INSERT: BLOCKED - " + e.message.substring(0, 30));
  }
  
  // Test 5: reset context
  total++;
  await pool.query("RESET app.current_org_id");
  const r5 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("Test 5 - After RESET, COUNT WHERE org_a: cnt=" + r5.rows[0].cnt);
  
  console.log("\n" + passed + "/" + total + " tests passed");
  
  await pool.end();
}

main();