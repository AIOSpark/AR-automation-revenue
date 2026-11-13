/**
 * Test the exact flow from enable_rls_tables.cjs but using a single client.
 * This is critical: the original script uses pool.query() which may not persist
 * the SET context across calls.
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
  console.log("=== TEST EXACT FLOW WITH SAME CLIENT ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  await pool.query("DELETE FROM udm_invoices WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  // Enable RLS and create policies (already done from clean_rls.cjs)
  // Verify policies exist
  const polCheck = await pool.query(
    "SELECT COUNT(*) as cnt FROM pg_policy WHERE polrelid = 'udm_payments'::regclass"
  );
  console.log("Policies on udm_payments: " + polCheck.rows[0].cnt);
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  let passed = 0;
  let total = 0;
  
  // CRITICAL: Use the SAME client for SET and all queries
  const client = await pool.connect();
  
  try {
    // Test 1: test_org_a inserts with org_a context
    total++;
    await client.query("SET app.current_org_id = 'test_org_a'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a1', 'test_org_a', 'cust_a', 'manual', 'manual_a', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      const r = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_a1'");
      if (r.rows[0].cnt === "1") { passed++; console.log("Test 1 PASS: test_org_a inserts own payment"); }
      else console.log("Test 1 FAIL: count=" + r.rows[0].cnt);
    } catch (e) {
      console.log("Test 1 ERROR: " + e.message.substring(0, 60));
    }
    
    // Test 2: test_org_b cannot INSERT with org_id = test_org_a
    total++;
    await client.query("SET app.current_org_id = 'test_org_b'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual_c', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      const r = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
      if (r.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: test_org_b cross-tenant INSERT blocked"); }
      else console.log("Test 2 FAIL: cross-tenant INSERT allowed, count=" + r.rows[0].cnt);
    } catch (e) {
      const r = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
      if (r.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: cross-tenant INSERT blocked (error)"); }
      else console.log("Test 2 PARTIAL: error, count=" + r.rows[0].cnt);
    }
    
    // Test 3: test_org_a can SELECT own payments
    total++;
    await client.query("SET app.current_org_id = 'test_org_a'");
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    if (r3.rows[0].cnt > 0) { passed++; console.log("Test 3 PASS: test_org_a can select own payments"); }
    else console.log("Test 3 FAIL: count=" + r3.rows[0].cnt);
    
    // Test 4: test_org_b cannot SELECT test_org_a's payments
    total++;
    await client.query("SET app.current_org_id = 'test_org_b'");
    const r4 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    if (r4.rows[0].cnt === "0") { passed++; console.log("Test 4 PASS: test_org_b cannot select org_a payments"); }
    else console.log("Test 4 FAIL: count=" + r4.rows[0].cnt);
    
    // Test 5: test_org_b can INSERT own payment
    total++;
    await client.query("SET app.current_org_id = 'test_org_b'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b1', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      const r = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_b1'");
      if (r.rows[0].cnt === "1") { passed++; console.log("Test 5 PASS: test_org_b inserts own payment"); }
      else console.log("Test 5 FAIL: count=" + r.rows[0].cnt);
    } catch (e) {
      console.log("Test 5 ERROR: " + e.message.substring(0, 60));
    }
    
    // Test 6: test_org_a cannot SELECT test_org_b's payments
    total++;
    await client.query("SET app.current_org_id = 'test_org_a'");
    const r6 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
    if (r6.rows[0].cnt === "0") { passed++; console.log("Test 6 PASS: test_org_a cannot select org_b payments"); }
    else console.log("Test 6 FAIL: count=" + r6.rows[0].cnt);
    
  } finally {
    client.release();
  }
  
  console.log("\n" + passed + "/" + total + " RLS isolation tests passed");
  
  await pool.end();
}

main();