/**
 * Create a PL/pgSQL function for RLS policy evaluation.
 * Uses public schema explicitly.
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
  console.log("=== CREATE RLS FUNCTION ===\n");
  
  // 1. Create the function in public schema
  await pool.query("DROP FUNCTION IF EXISTS public.current_org_context()");
  await pool.query(
    "CREATE OR REPLACE FUNCTION public.current_org_context()\n" +
    "RETURNS text\n" +
    "AS $$\n" +
    "BEGIN\n" +
    "  RETURN NULLIF(current_setting('app.current_org_id', true), '');\n" +
    "END;\n" +
    "$$ LANGUAGE plpgsql STABLE;"
  );
  console.log("Function public.current_org_context() created");
  
  // 2. Clean state
  await pool.query("DELETE FROM udm_payments");
  
  // 3. Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // 4. Enable RLS and create policies using the function
  await pool.query("ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY");
  
  for (const cmd of [
    "DROP POLICY IF EXISTS org_isolation_select ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_insert ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_update ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_delete ON udm_payments"
  ]) {
    try { await pool.query(cmd); } catch (e) {}
  }
  
  // Use the function in policies
  const funcCheck = "organization_id = public.current_org_context()";
  
  await pool.query("CREATE POLICY org_isolation_select ON udm_payments FOR SELECT USING (" + funcCheck + ")");
  await pool.query("CREATE POLICY org_isolation_insert ON udm_payments FOR INSERT WITH CHECK (" + funcCheck + ")");
  await pool.query("CREATE POLICY org_isolation_update ON udm_payments FOR UPDATE USING (" + funcCheck + ") WITH CHECK (" + funcCheck + ")");
  await pool.query("CREATE POLICY org_isolation_delete ON udm_payments FOR DELETE USING (" + funcCheck + ")");
  
  // 5. Verify policies
  const polResult = await pool.query(
    "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname"
  );
  console.log("Policies:");
  polResult.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
  });
  
  // 6. Test with context
  await pool.query("SET app.current_org_id = 'test_org_a'");
  
  // Test SELECT *
  const r1 = await pool.query("SELECT * FROM udm_payments");
  console.log("\nSELECT * with org_a context: rows=" + r1.rows.length + " (expected: 1 if RLS working)");
  
  // Test COUNT(*)
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("SELECT COUNT(*) with org_a context: " + r2.rows[0].cnt + " (expected: 1 if RLS working)");
  
  // Test: can test_org_b see test_org_a's payment?
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("With org_b context, COUNT(): " + r3.rows[0].cnt + " (expected: 0 if RLS blocking org_a)");
  
  // Test INSERT cross-tenant
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r4 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    console.log("Cross-tenant INSERT: count=" + r4.rows[0].cnt + " (expected: 0 if RLS blocking WITH CHECK)");
  } catch (e) {
    console.log("Cross-tenant INSERT error (expected if RLS working): " + e.message.substring(0, 60));
  }
  
  console.log("\n=== END ===");
  
  await pool.end();
}

main();