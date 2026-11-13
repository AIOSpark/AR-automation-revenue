/**
 * Debug SELECT RLS vs INSERT RLS.
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
  console.log("=== DEBUG SELECT VS INSERT ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Verify policies
  const pol = await pool.query("SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname");
  console.log("Policies:"); pol.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
  });
  
  // Use client for all operations
  const client = await pool.connect();
  
  try {
    // Test INSERT with org_a context - should work with WITH CHECK
    await client.query("SET app.current_org_id = 'test_org_a'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_insert', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log("\nINSERT with org_a context: allowed (WITH CHECK passed)");
    } catch (e) {
      console.log("\nINSERT with org_a context: blocked - " + e.message.substring(0, 30));
    }
    
    // Test INSERT cross-tenant with org_b context
    await client.query("SET app.current_org_id = 'test_org_b'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log("INSERT cross-tenant with org_b: allowed (unexpected)");
    } catch (e) {
      console.log("INSERT cross-tenant with org_b: blocked - RLS working");
    }
    
    // Test SELECT * with org_a
    await client.query("SET app.current_org_id = 'test_org_a'");
    const r1 = await client.query("SELECT * FROM udm_payments");
    console.log("\nSELECT * with org_a: rows=" + r1.rows.length);
    
    // Test SELECT COUNT WHERE org_a with org_a
    const r2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("SELECT COUNT WHERE org_a with org_a: " + r2.rows[0].cnt);
    
    // Test SELECT COUNT WHERE org_a with org_b
    await client.query("SET app.current_org_id = 'test_org_b'");
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("SELECT COUNT WHERE org_a with org_b: " + r3.rows[0].cnt + " (expected: 0 if RLS working)");
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main();