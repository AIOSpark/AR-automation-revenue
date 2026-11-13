/**
 * Enable RLS on all payment-domain tables and verify.
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
  console.log("=== ENABLE RLS ON PAYMENT TABLES ===\n");
  
  const paymentTables = [
    'udm_payments',
    'udm_invoices', 
    'udm_payment_allocations',
    'udm_payment_refunds',
    'udm_payment_reversals',
    'udm_ar_reconciliation'
  ];
  
  let passed = 0;
  let total = 0;
  
  for (const table of paymentTables) {
    total++;
    
    // Enable RLS
    console.log(`Enabling RLS on ${table}...`);
    try {
      await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      console.log(`  => RLS enabled on ${table}`);
    } catch (e) {
      console.log(`  => Error enabling RLS on ${table}: ${e.message.substring(0, 60)}`);
    }
    
    // Verify RLS is enabled
    const tbl = await pool.query('SELECT relname, reloptions FROM pg_class WHERE relname = $1', [table]);
    const hasRls = tbl.rows[0].reloptions && tbl.rows[0].reloptions.includes('rdp');
    if (hasRls) {
      passed++;
      console.log(`  => RLS verified enabled on ${table}`);
    } else {
      console.log(`  => RLS NOT enabled on ${table} (reloptions: ${tbl.rows[0].reloptions})`);
    }
  }
  
  console.log(`\n${passed}/${total} tables have RLS enabled`);
  
  // Now test RLS isolation
  console.log("\n=== RLS ISOLATION TESTS ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  await pool.query("DELETE FROM udm_invoices WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  let rlsPassed = 0;
  let rlsTotal = 0;
  
  // Test 1: test_org_a inserts with org_a context
  rlsTotal++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a1', 'test_org_a', 'cust_a', 'manual', 'manual_a', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_a1'");
    if (r.rows[0].cnt === "1") { rlsPassed++; console.log("Test 1 PASS: test_org_a inserts own payment"); }
    else console.log("Test 1 FAIL: count=" + r.rows[0].cnt);
  } catch (e) {
    console.log("Test 1 ERROR: " + e.message.substring(0, 60));
  }
  
  // Test 2: test_org_b cannot INSERT with org_id = test_org_a
  rlsTotal++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual_c', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    if (r.rows[0].cnt === "0") { rlsPassed++; console.log("Test 2 PASS: test_org_b cross-tenant INSERT blocked"); }
    else console.log("Test 2 FAIL: cross-tenant INSERT allowed, count=" + r.rows[0].cnt);
  } catch (e) {
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    if (r.rows[0].cnt === "0") { rlsPassed++; console.log("Test 2 PASS: cross-tenant INSERT blocked (error)"); }
    else console.log("Test 2 PARTIAL: error, count=" + r.rows[0].cnt);
  }
  
  // Test 3: test_org_a can SELECT own payments
  rlsTotal++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r3.rows[0].cnt > 0) { rlsPassed++; console.log("Test 3 PASS: test_org_a can select own payments"); }
  else console.log("Test 3 FAIL: count=" + r3.rows[0].cnt);
  
  // Test 4: test_org_b cannot SELECT test_org_a's payments
  rlsTotal++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r4 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r4.rows[0].cnt === "0") { rlsPassed++; console.log("Test 4 PASS: test_org_b cannot select org_a payments"); }
  else console.log("Test 4 FAIL: count=" + r4.rows[0].cnt);
  
  // Test 5: test_org_b can INSERT own payment
  rlsTotal++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b1', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_b1'");
    if (r.rows[0].cnt === "1") { rlsPassed++; console.log("Test 5 PASS: test_org_b inserts own payment"); }
    else console.log("Test 5 FAIL: count=" + r.rows[0].cnt);
  } catch (e) {
    console.log("Test 5 ERROR: " + e.message.substring(0, 60));
  }
  
  // Test 6: test_org_a cannot SELECT test_org_b's payments
  rlsTotal++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r6 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
  if (r6.rows[0].cnt === "0") { rlsPassed++; console.log("Test 6 PASS: test_org_a cannot select org_b payments"); }
  else console.log("Test 6 FAIL: count=" + r6.rows[0].cnt);
  
  console.log(`\n${rlsPassed}/${rlsTotal} RLS isolation tests passed`);
  
  await pool.end();
}

main();