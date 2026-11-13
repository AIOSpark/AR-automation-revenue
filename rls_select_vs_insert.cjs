/**
 * Investigate why SELECT RLS isn't working but INSERT WITH CHECK seems to work.
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
  console.log("=== RLS SELECT vs INSERT ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  
  // Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // Use same client for everything
  const client = await pool.connect();
  
  try {
    // Verify policies
    const pol = await client.query(\"SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname\");
    console.log("Policies:"); pol.rows.forEach(p => {
      const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
      console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
    });
    
    // Test INSERT with org_a context
    console.log("\n--- INSERT TESTS ---");
    await client.query("SET app.current_org_id = 'test_org_a'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_insert_test', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      const insertCheck = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_insert_test'");
      console.log("INSERT org_a with org_a context: count=" + insertCheck.rows[0].cnt);
    } catch (e) {
      console.log("INSERT org_a with org_a context: ERROR " + e.message.substring(0, 30));
    }
    
    // Test INSERT cross-tenant with org_b context
    await client.query("SET app.current_org_id = 'test_org_b'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross_test', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      const insertCheck = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross_test'");
      console.log("INSERT org_a with org_b context: count=" + insertCheck.rows[0].cnt);
    } catch (e) {
      console.log("INSERT org_a with org_b context: ERROR " + e.message.substring(0, 30));
    }
    
    // Clean up test rows
    await client.query("DELETE FROM udm_payments WHERE id IN ('pay_insert_test', 'pay_cross_test')");
    
    // TEST SELECT
    console.log("\n--- SELECT TESTS ---");
    
    // With org_a context, SELECT *
    await client.query("SET app.current_org_id = 'test_org_a'");
    const r1 = await client.query("SELECT * FROM udm_payments");
    console.log("SELECT * with org_a: rows=" + r1.rows.length);
    
    // With org_b context, SELECT *
    await client.query("SET app.current_org_id = 'test_org_b'");
    const r2 = await client.query("SELECT * FROM udm_payments");
    console.log("SELECT * with org_b: rows=" + r2.rows.length);
    
    // SELECT COUNT WHERE organization_id = test_org_a with org_a context
    await client.query("SET app.current_org_id = 'test_org_a'");
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("COUNT WHERE org_a with org_a: " + r3.rows[0].cnt);
    
    // SELECT COUNT WHERE organization_id = test_org_a with org_b context
    await client.query("SET app.current_org_id = 'test_org_b'");
    const r4 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("COUNT WHERE org_a with org_b: " + r4.rows[0].cnt + " (expected: 0 if RLS working)");
    
    // Direct expression test
    await client.query("SET app.current_org_id = 'test_org_a'");
    const r5 = await client.query("SELECT id, organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS eval FROM udm_payments");
    console.log("\nDirect expression eval:"); r5.rows.forEach(r => {
      console.log("  id=" + r.id + " eval=" + r.eval);
    });
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main();