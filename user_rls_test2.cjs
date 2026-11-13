/**
 * Test RLS as test_org_a user - SELECT and context tests.
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
  
  let passed = 0;
  let total = 0;
  
  // Test 1: org_a can read own payment
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  const t1 = r1.rows[0].cnt === "1";
  if (t1) { passed++; }
  console.log("Test 1 " + (t1 ? "PASS" : "FAIL") + ": org_a can read own payment (cnt=" + r1.rows[0].cnt + ")");
  
  // Test 2: org_b cannot read org_a's payment  
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  const t2 = r2.rows[0].cnt === "0";
  if (t2) { passed++; }
  console.log("Test 2 " + (t2 ? "PASS" : "FAIL") + ": org_b cannot read org_a's payment (cnt=" + r2.rows[0].cnt + ", expected: 0)");
  
  // Test 3: org_a can read own payment again (context switch)
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  const t3 = r3.rows[0].cnt === "1";
  if (t3) { passed++; }
  console.log("Test 3 " + (t3 ? "PASS" : "FAIL") + ": org_a can read own payment after switch (cnt=" + r3.rows[0].cnt + ")");
  
  // Test 4: cross-tenant INSERT blocked (should error)
  total++;
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_b', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log("Test 4 - Cross-tenant INSERT: ALLOWED (unexpected - RLS not working)");
  } catch (e) {
    passed++;
    console.log("Test 4 PASS: Cross-tenant INSERT blocked by RLS");
  }
  
  // Test 5: own INSERT allowed
  total++;
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log("Test 5 - Own INSERT: ALLOWED (expected)");
    passed++; // Own INSERT is allowed
  } catch (e) {
    console.log("Test 5 - Own INSERT: BLOCKED - " + e.message.substring(0, 30));
  }
  
  // Test 6: Missing context fails closed
  total++;
  await pool.query("RESET app.current_org_id");
  const r6 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  const t6 = r6.rows[0].cnt === "0";
  if (t6) { passed++; }
  console.log("Test 6 " + (t6 ? "PASS" : "FAIL") + ": Missing context fails closed (cnt=" + r6.rows[0].cnt + ", expected: 0)");
  
  // Test 7: Invalid context fails closed
  total++;
  await pool.query("SET app.current_org_id = 'nonexistent'");
  const r7 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  const t7 = r7.rows[0].cnt === "0";
  if (t7) { passed++; }
  console.log("Test 7 " + (t7 ? "PASS" : "FAIL") + ": Invalid context fails closed (cnt=" + r7.rows[0].cnt + ", expected: 0)");
  
  console.log("\n" + passed + "/" + total + " RLS tests as test_org_a");
  
  await pool.end();
}

main();