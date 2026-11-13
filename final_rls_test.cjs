/**
 * Final RLS test using direct current_setting expression (no custom function).
 * Uses: organization_id = NULLIF(current_setting('app.current_org_id', true), '')
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
  console.log("=== FINAL RLS TEST ===\n");
  
  // 1. Ensure the function doesn't interfere - drop it if it exists
  try {
    await pool.query("DROP FUNCTION IF EXISTS current_app_tenant_id()");
    console.log("1. Dropped any existing function");
  } catch (e) {
    console.log("1. Function drop: " + e.message.substring(0, 40));
  }
  
  // 2. Drop and recreate RLS policies with direct current_setting expression
  const paymentTables = [
    'udm_payments',
    'udm_invoices', 
    'udm_payment_allocations',
    'udm_payment_refunds',
    'udm_payment_reversals',
    'udm_ar_reconciliation'
  ];
  
  const orgCheck = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";
  
  console.log("2. Recreating RLS policies with expression:", orgCheck);
  
  for (const table of paymentTables) {
    // Drop existing policies
    for (const cmd of [
      `DROP POLICY IF EXISTS org_isolation_select ON ${table}`,
      `DROP POLICY IF EXISTS org_isolation_insert ON ${table}`,
      `DROP POLICY IF EXISTS org_isolation_update ON ${table}`,
      `DROP POLICY IF EXISTS org_isolation_delete ON ${table}`
    ]) {
      try { await pool.query(cmd); } catch (e) {}
    }
    
    // Create new policies using direct current_setting expression
    await pool.query(`CREATE POLICY org_isolation_select ON ${table} FOR SELECT USING (${orgCheck})`);
    await pool.query(`CREATE POLICY org_isolation_insert ON ${table} FOR INSERT WITH CHECK (${orgCheck})`);
    await pool.query(`CREATE POLICY org_isolation_update ON ${table} FOR UPDATE USING (${orgCheck}) WITH CHECK (${orgCheck})`);
    await pool.query(`CREATE POLICY org_isolation_delete ON ${table} FOR DELETE USING (${orgCheck})`);
    
    console.log(`   ${table}: policies created`);
  }
  
  // 3. Verify policies
  console.log("\n3. Policy verification:");
  for (const table of paymentTables) {
    const polResult = await pool.query(
      "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polcmd, polname",
      [table]
    );
    console.log("  " + table + ":");
    polResult.rows.forEach(p => {
      const cmdMap = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE'};
      const ptype = cmdMap[p.polcmd] || p.polcmd;
      let hasQual = p.polqual ? 'HAS QUAL' : 'NO QUAL';
      let hasWCheck = p.polwithcheck ? 'HAS WCHECK' : 'NO WCHECK';
      console.log(`    ${ptype}: ${p.polname} - ${hasQual}, ${hasWCheck}`);
    });
  }
  
  // 4. Test RLS isolation
  console.log("\n4. RLS Isolation Tests:");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  await pool.query("DELETE FROM udm_invoices WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  let passed = 0;
  let total = 0;
  
  // Test 1: test_org_a inserts with org_a context
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a1', 'test_org_a', 'cust_a', 'manual', 'manual_a', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_a1'");
    if (r.rows[0].cnt === "1") { passed++; console.log("Test 1 PASS: test_org_a inserts own payment"); }
    else console.log("Test 1 FAIL: count=" + r.rows[0].cnt);
  } catch (e) {
    console.log("Test 1 ERROR: " + e.message.substring(0, 60));
  }
  
  // Test 2: test_org_b cannot INSERT with org_id = test_org_a (cross-tenant)
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual_c', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    if (r.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: test_org_b cross-tenant INSERT blocked"); }
    else console.log("Test 2 FAIL: cross-tenant INSERT allowed, count=" + r.rows[0].cnt);
  } catch (e) {
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    if (r.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: cross-tenant INSERT blocked (error)"); }
    else console.log("Test 2 PARTIAL: error, count=" + r.rows[0].cnt);
  }
  
  // Test 3: test_org_a can SELECT own payments
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r3.rows[0].cnt > 0) { passed++; console.log("Test 3 PASS: test_org_a can select own payments"); }
  else console.log("Test 3 FAIL: count=" + r3.rows[0].cnt);
  
  // Test 4: test_org_b cannot SELECT test_org_a's payments
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r4 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r4.rows[0].cnt === "0") { passed++; console.log("Test 4 PASS: test_org_b cannot select org_a payments"); }
  else console.log("Test 4 FAIL: count=" + r4.rows[0].cnt);
  
  // Test 5: test_org_b can INSERT own payment
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b1', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_b1'");
    if (r.rows[0].cnt === "1") { passed++; console.log("Test 5 PASS: test_org_b inserts own payment"); }
    else console.log("Test 5 FAIL: count=" + r.rows[0].cnt);
  } catch (e) {
    console.log("Test 5 ERROR: " + e.message.substring(0, 60));
  }
  
  // Test 6: test_org_a cannot SELECT test_org_b's payments
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r6 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
  if (r6.rows[0].cnt === "0") { passed++; console.log("Test 6 PASS: test_org_a cannot select org_b payments"); }
  else console.log("Test 6 FAIL: count=" + r6.rows[0].cnt);
  
  console.log(`\n${passed}/${total} RLS isolation tests passed`);
  
  await pool.end();
}

main();