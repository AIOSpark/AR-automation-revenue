const { Pool } = require("pg");
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "test_org_b",
  password: "test_org_b_pwd",
  database: "aiospark_revenue",
});

async function main() {
  // Ensure clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  let passed = 0;
  let total = 0;
  
  // Test 1: test_org_b can INSERT its own payment (org_id = test_org_b)
  total++;
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b1', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  let r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_b1'");
  if (r.rows[0].cnt === "1") { passed++; console.log("Test 1 PASS: test_org_b inserts own payment"); }
  else console.log("Test 1 FAIL: test_org_b inserts own payment, count=" + r.rows[0].cnt);
  
  // Test 2: test_org_b cannot INSERT with org_id = test_org_a (cross-tenant)
  total++;
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual_c', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
  if (r.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: test_org_b cross-tenant INSERT blocked by RLS"); }
  else console.log("Test 2 FAIL: test_org_b cross-tenant INSERT not blocked, count=" + r.rows[0].cnt);
  
  // Test 3: test_org_b can SELECT its own payments
  total++;
  r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
  if (r.rows[0].cnt > 0) { passed++; console.log("Test 3 PASS: test_org_b can select own payments"); }
  else console.log("Test 3 FAIL: test_org_b cannot select own payments, count=" + r.rows[0].cnt);
  
  // Test 4: test_org_b cannot SELECT test_org_a's payments (RLS)
  total++;
  r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r.rows[0].cnt === "0") { passed++; console.log("Test 4 PASS: test_org_b cannot select org_a payments (RLS)"); }
  else console.log("Test 4 FAIL: test_org_b can select org_a payments, count=" + r.rows[0].cnt);
  
  console.log(`\n${passed}/${total} tests passed`);
  
  await pool.end();
}

main();