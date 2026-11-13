/**
 * Debug RLS policy application on udm_payments.
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
  console.log("=== DEBUG RLS ===\n");
  
  // 1. Clean state
  await pool.query("DELETE FROM udm_payments");
  
  // 2. Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // 3. Enable RLS and recreate policies
  await pool.query("ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY");
  
  const orgCheck = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";
  
  for (const cmd of [
    "DROP POLICY IF EXISTS org_isolation_select ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_insert ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_update ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_delete ON udm_payments"
  ]) {
    try { await pool.query(cmd); } catch (e) {}
  }
  
  await pool.query("CREATE POLICY org_isolation_select ON udm_payments FOR SELECT USING (" + orgCheck + ")");
  await pool.query("CREATE POLICY org_isolation_insert ON udm_payments FOR INSERT WITH CHECK (" + orgCheck + ")");
  await pool.query("CREATE POLICY org_isolation_update ON udm_payments FOR UPDATE USING (" + orgCheck + ") WITH CHECK (" + orgCheck + ")");
  await pool.query("CREATE POLICY org_isolation_delete ON udm_payments FOR DELETE USING (" + orgCheck + ")");
  
  // 4. Verify policies
  const polResult = await pool.query(
    "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname"
  );
  console.log("Policies:");
  polResult.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
  });
  
  // 5. Check RLS status
  const tbl = await pool.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'udm_payments'");
  console.log("\nTable RLS status: relrowsecurity=" + tbl.rows[0].relrowsecurity + " relforcerowsecurity=" + tbl.rows[0].relforcerowsecurity);
  
  // 6. Test with context
  await pool.query("SET app.current_org_id = 'test_org_a'");
  
  // Test SELECT * - should be filtered by RLS
  const r1 = await pool.query("SELECT * FROM udm_payments");
  console.log("\nSELECT * with org_a context: rows=" + r1.rows.length + " (expected: 1 if RLS working)");
  
  // Test COUNT(*)
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("SELECT COUNT(*) with org_a context: " + r2.rows[0].cnt + " (expected: 1 if RLS working)");
  
  // Test direct query without RLS filtering (bypass)
  const r3 = await pool.query("SELECT id, organization_id FROM udm_payments");
  console.log("Direct SELECT id, org_id: " + r3.rows.length + " rows");
  r3.rows.forEach(r => console.log("  - " + r.id + ": " + r.organization_id));
  
  // 6. Test the policy expression directly
  const r4 = await pool.query("SELECT organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS match FROM udm_payments LIMIT 1");
  console.log("\nPolicy expression direct check: " + r4.rows[0].match + " (true=matches, false=no match)");
  
  // 7. Test: can test_org_b see test_org_a's payment?
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r5 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("\nWith org_b context, SELECT COUNT(): " + r5.rows[0].cnt + " (expected: 0 if RLS blocking org_a, or 1 if not working)");
  
  // 8. Test INSERT cross-tenant
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r6 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    console.log("\nCross-tenant INSERT: count=" + r6.rows[0].cnt + " (expected: 0 if RLS blocking WITH CHECK)");
  } catch (e) {
    console.log("\nCross-tenant INSERT error (expected if RLS working): " + e.message.substring(0, 60));
  }
  
  console.log("\n=== END DEBUG ===");
  
  await pool.end();
}

main();