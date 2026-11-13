/**
 * Simple RLS test - try without NULLIF and with direct comparison.
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
  console.log("=== SIMPLE RLS TEST ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Enable RLS and create simple policy
  await pool.query("ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY");
  
  // Drop existing policies
  for (const cmd of [
    "DROP POLICY IF EXISTS org_isolation_select ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_insert ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_update ON udm_payments",
    "DROP POLICY IF EXISTS org_isolation_delete ON udm_payments"
  ]) {
    try { await pool.query(cmd); } catch (e) {}
  }
  
  // Try a simpler policy: just check organization_id directly
  // This avoids potential current_setting evaluation issues
  await pool.query("CREATE POLICY simple_select ON udm_payments FOR SELECT USING (organization_id = 'test_org_a')");
  await pool.query("CREATE POLICY simple_insert ON udm_payments FOR INSERT WITH CHECK (organization_id = 'test_org_a')");
  
  // Verify
  const pol = await pool.query(\"SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname\");
  console.log("Policies:"); pol.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
  });
  
  // Test with client
  const client = await pool.connect();
  try {
    // With org_a context (but policy uses hardcoded 'test_org_a')
    await client.query("SET app.current_org_id = 'test_org_a'");
    
    // SELECT *
    const r1 = await client.query("SELECT * FROM udm_payments");
    console.log("\nSELECT * with org_a context, simple policy: rows=" + r1.rows.length);
    
    // With org_b context
    await client.query("SET app.current_org_id = 'test_org_b'");
    const r2 = await client.query("SELECT * FROM udm_payments");
    console.log("SELECT * with org_b context, simple policy: rows=" + r2.rows.length);
    
    // INSERT with org_b context trying to insert org_a
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_test', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_test'");
      console.log("INSERT org_a with org_b context: count=" + r3.rows[0].cnt);
    } catch (e) {
      console.log("INSERT org_a with org_b context: ERROR " + e.message.substring(0, 30));
    }
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main();