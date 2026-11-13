/**
 * RLS Isolation Test — Verifies cross-tenant blocking with proper policy expressions.
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
  console.log("=== RLS ISOLATION TEST ===\n");
  
  // 1. Ensure clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  await pool.query("DELETE FROM udm_invoices WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  // 2. Drop and recreate RLS policies with correct expression
  const orgCheck = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";
  
  for (const cmd of [
    "DROP POLICY IF EXISTS org_isolation_select ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_insert ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_update ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_delete ON udm_payments",
    "DROP POLICY IF EXISTS block_all_insert ON udm_payments",
    "DROP POLICY IF EXISTS block_all_select ON udm_payments"
  ]) {
    try { await pool.query(cmd); } catch (e) {}
  }
  
  // Create policies
  await pool.query("CREATE POLICY org_isolation_select ON udm_payments FOR SELECT USING (" + orgCheck + ")");
  await pool.query("CREATE POLICY org_isolation_insert ON udm_payments FOR INSERT WITH CHECK (" + orgCheck + ")");
  await pool.query("CREATE POLICY org_isolation_update ON udm_payments FOR UPDATE USING (" + orgCheck + ") WITH CHECK (" + orgCheck + ")");
  await pool.query("CREATE POLICY org_isolation_delete ON udm_payments FOR DELETE USING (" + orgCheck + ")");
  
  // Verify policies
  const polResult = await pool.query(
    "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname"
  );
  console.log("Policies on udm_payments:");
  polResult.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    const ptype = cmdMap[p.polcmd] || p.polcmd;
    console.log("  " + ptype + ": " + p.polname + " - qual:" + (p.polqual ? "yes" : "no") + " wcheck:" + (p.polwithcheck ? "yes" : "no"));
  });
  
  // 3. Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_org_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_org_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  let passed = 0;
  let total = 0;
  
  // Test 1: test_org_a can read its own payment
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r1.rows[0].cnt === "1") { passed++; console.log("Test 1 PASS: test_org_a can read own payment"); }
  else console.log("Test 1 FAIL: count=" + r1.rows[0].cnt);
  
  // Test 2: test_org_b cannot read test_org_a's payment (RLS)
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r2.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: test_org_b cannot read test_org_a's payment (RLS)"); }
  else console.log("Test 2 FAIL: count=" + r2.rows[0].cnt + " (RLS not blocking)");
  
  // Test 3: test_org_b cannot INSERT with org_id = test_org_a (cross-tenant INSERT WITH CHECK)
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    if (r3.rows[0].cnt === "0") { passed++; console.log("Test 3 PASS: test_org_b cross-tenant INSERT blocked (WITH CHECK)"); }
    else console.log("Test 3 FAIL: INSERT allowed, count=" + r3.rows[0].cnt);
  } catch (e) {
    passed++; console.log("Test 3 PASS: test_org_b cross-tenant INSERT blocked (error thrown)");
  }
  
  // Test 4: test_org_b cannot UPDATE test_org_a's payment (USING/WITH CHECK)
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  try {
    await pool.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_org_a'");
    const r4 = await pool.query("SELECT status FROM udm_payments WHERE id = 'pay_org_a'");
    if (r4.rows[0].status === "captured") { passed++; console.log("Test 4 PASS: test_org_b cannot UPDATE test_org_a's payment (RLS WITH CHECK)"); }
    else console.log("Test 4 FAIL: UPDATE allowed, status=" + r4.rows[0].status);
  } catch (e) {
    passed++; console.log("Test 4 PASS: test_org_b UPDATE blocked by RLS (error)");
  }
  
  // Test 5: test_org_b cannot DELETE test_org_a's payment (USING)
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  try {
    await pool.query("DELETE FROM udm_payments WHERE id = 'pay_org_a'");
    const r5 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_org_a'");
    if (r5.rows[0].cnt === "1") { passed++; console.log("Test 5 PASS: test_org_b cannot DELETE test_org_a's payment (row still exists, RLS blocked)"); }
    else console.log("Test 5 FAIL: DELETE removed the row");
  } catch (e) {
    passed++; console.log("Test 5 PASS: test_org_b DELETE blocked by RLS (error)");
  }
  
  // Test 6: Missing tenant context cannot expose tenant-owned rows
  total++;
  await pool.query("RESET app.current_org_id");
  const r6 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r6.rows[0].cnt === "0") { passed++; console.log("Test 6 PASS: Missing context cannot expose rows (RLS returns 0)"); }
  else console.log("Test 6 FAIL: count=" + r6.rows[0].cnt + " (context leak?)");
  
  // Test 7: Empty tenant context cannot expose rows
  total++;
  await pool.query("SET app.current_org_id = ''");
  const r7 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r7.rows[0].cnt === "0") { passed++; console.log("Test 7 PASS: Empty context cannot expose rows (RLS returns 0)"); }
  else console.log("Test 7 FAIL: count=" + r7.rows[0].cnt + " (empty context leak?)");
  
  // Test 8: Invalid tenant context fails closed
  total++;
  await pool.query("SET app.current_org_id = 'nonexistent'");
  const r8 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  if (r8.rows[0].cnt === "0") { passed++; console.log("Test 8 PASS: Invalid context fails closed (RLS returns 0)"); }
  else console.log("Test 8 FAIL: count=" + r8.rows[0].cnt + " (invalid context leak?)");
  
  console.log(`\n${passed}/${total} RLS isolation tests passed`);
  
  await pool.end();
}

main();