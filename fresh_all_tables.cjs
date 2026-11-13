/**
 * Fresh RLS test - clean slate, recreate all policies from scratch.
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
  console.log("=== FRESH RLS FROM SCRATCH ===\n");
  
  // 1. Clean ALL data from all tables
  const tables = [
    'udm_ar_reconciliation', 'udm_payment_reversals', 'udm_payment_refunds',
    'udm_payment_allocations', 'udm_invoices', 'udm_payments'
  ];
  
  for (const table of tables) {
    await pool.query("DELETE FROM " + table + " WHERE organization_id IN ('test_org_a', 'test_org_b')");
  }
  
  // 2. Drop ALL policies on ALL tables
  console.log("Dropping all policies...");
  for (const table of tables) {
    const polResult = await pool.query(
      "SELECT polname FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polname",
      [table]
    );
    for (const row of polResult.rows) {
      try { await pool.query("DROP POLICY IF EXISTS " + row.polname + " ON " + table); } catch (e) {}
    }
  }
  
  // 3. Verify no policies remain
  console.log("Verifying policies dropped:");
  for (const table of tables) {
    const pol = await pool.query(
      "SELECT COUNT(*) as cnt FROM pg_policy WHERE polrelid = $1::regclass",
      [table]
    );
    console.log("  " + table + ": " + pol.rows[0].cnt + " policies");
  }
  
  // 4. Enable RLS on all tables
  for (const table of tables) {
    try { await pool.query("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"); } catch (e) {}
  }
  
  // 5. Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // 6. Create policies on ALL tables with the same expression
  const orgCheck = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";
  
  for (const table of tables) {
    try {
      await pool.query("CREATE POLICY org_isolation_select ON " + table + " FOR SELECT USING (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_insert ON " + table + " FOR INSERT WITH CHECK (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_update ON " + table + " FOR UPDATE USING (" + orgCheck + ") WITH CHECK (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_delete ON " + table + " FOR DELETE USING (" + orgCheck + ")");
    } catch (e) {
      console.log("Error creating policies on " + table + ": " + e.message.substring(0, 30));
    }
  }
  
  // 7. Verify all policies
  console.log("\n=== All Policies ===");
  for (const table of tables) {
    const polResult = await pool.query(
      "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polcmd, polname",
      [table]
    );
    console.log(table + ":"); polResult.rows.forEach(p => {
      const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
      console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
    });
  }
  
  // 8. Test with same client pattern
  const client = await pool.connect();
  
  try {
    let passed = 0;
    let total = 0;
    
    // Test A: SELECT with org_a context
    total++;
    await client.query("SET app.current_org_id = 'test_org_a'");
    const a1 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("\nTest A - SELECT COUNT WHERE org_a with org_a: " + a1.rows[0].cnt);
    
    // Test B: SELECT with org_b context
    total++;
    await client.query("SET app.current_org_id = 'test_org_b'");
    const a2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("Test B - SELECT COUNT WHERE org_a with org_b: " + a2.rows[0].cnt + " (expected: 0)");
    
    // Test C: INSERT cross-tenant
    total++;
    await client.query("SET app.current_org_id = 'test_org_b'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log("Test C - Cross-tenant INSERT: allowed (unexpected)");
    } catch (e) {
      console.log("Test C - Cross-tenant INSERT: blocked by RLS");
      passed++;
    }
    
    // Test D: Own INSERT
    total++;
    await client.query("SET app.current_org_id = 'test_org_a'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log("Test D - Own INSERT: allowed (expected)");
      passed++; // Own INSERT is allowed
    } catch (e) {
      console.log("Test D - Own INSERT: blocked - " + e.message.substring(0, 30));
    }
    
    // Test E: Other table - INSERT cross-tenant
    total++;
    try {
      await client.query(
        "INSERT INTO udm_invoices (id, payment_id, organization_id, amount_minor_units, currency, date, status) VALUES ('inv_cross', 'pay_a', 'test_org_a', 500, 'INR', NOW(), 'open')"
      );
      const r5 = await client.query("SELECT COUNT(*) as cnt FROM udm_invoices WHERE id = 'inv_cross'");
      console.log("Test E - Cross-tenant INSERT invoice: allowed, cnt=" + r5.rows[0].cnt);
    } catch (e) {
      passed++;
      console.log("Test E - Cross-tenant INSERT invoice: blocked by RLS");
    }
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main();