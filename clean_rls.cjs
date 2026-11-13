/**
 * Clean RLS - drop all existing policies and recreate from scratch.
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
  console.log("=== CLEAN RLS ===\n");
  
  const tables = [
    'udm_payments', 'udm_invoices', 'udm_payment_allocations',
    'udm_payment_refunds', 'udm_payment_reversals', 'udm_ar_reconciliation'
  ];
  
  // 1. Delete test data
  for (const table of tables) {
    await pool.query("DELETE FROM " + table + " WHERE organization_id IN ('test_org_a', 'test_org_b')");
  }
  
  // 2. Drop ALL policies on all tables
  console.log("Dropping all policies...");
  for (const table of tables) {
    // Get all policy names
    const polResult = await pool.query(
      "SELECT polname FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polname",
      [table]
    );
    for (const row of polResult.rows) {
      try {
        await pool.query("DROP POLICY IF EXISTS " + row.polname + " ON " + table);
        console.log("  Dropped: " + row.polname + " ON " + table);
      } catch (e) {
        console.log("  Error dropping " + row.polname + ": " + e.message.substring(0, 30));
      }
    }
  }
  
  // 3. Verify no policies remain
  console.log("\nVerifying policies dropped:");
  for (const table of tables) {
    const pol = await pool.query(
      "SELECT COUNT(*) as cnt FROM pg_policy WHERE polrelid = $1::regclass",
      [table]
    );
    console.log("  " + table + ": " + pol.rows[0].cnt + " policies");
  }
  
  // 4. Enable RLS on all tables
  for (const table of tables) {
    try { await pool.query("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"); } 
    catch (e) {}
  }
  
  // 5. Create fresh policies with the correct expression
  const orgCheck = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";
  
  for (const table of tables) {
    try {
      await pool.query("CREATE POLICY org_isolation_select ON " + table + " FOR SELECT USING (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_insert ON " + table + " FOR INSERT WITH CHECK (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_update ON " + table + " FOR UPDATE USING (" + orgCheck + ") WITH CHECK (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_delete ON " + table + " FOR DELETE USING (" + orgCheck + ")");
    } catch (e) {
      console.log("Error creating policies on " + table + ": " + e.message.substring(0, 40));
    }
  }
  
  // 6. Verify policies
  console.log("\n=== Created Policies ===");
  for (const table of tables) {
    const polResult = await pool.query(
      "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polcmd, polname",
      [table]
    );
    console.log(table + ":");
    polResult.rows.forEach(p => {
      const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
      console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
    });
  }
  
  // 7. Insert test data
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  // 8. Test RLS
  console.log("\n=== RLS Isolation Tests ===");
  
  let passed = 0;
  let total = 0;
  
  // Test A: org_a can read own payment
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const a1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("A1 - SELECT COUNT with org_a: " + a1.rows[0].cnt + " rows");
  
  // Test B: org_b cannot read org_a's payment
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const a2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("B1 - SELECT COUNT with org_b: " + a2.rows[0].cnt + " rows (expected: 1, should be 0 if RLS working for own data)");
  
  // Test C: org_b cannot read org_a's payment specifically
  total++;
  const a3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("B2 - With org_b, counting org_a payments: " + a3.rows[0].cnt + " (expected: 0 if RLS blocking)");
  if (a3.rows[0].cnt === "0") { passed++; console.log("  PASS"); }
  else { console.log("  FAIL"); }
  
  // Test D: cross-tenant INSERT
  total++;
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const a4 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    console.log("C1 - Cross-tenant INSERT: count=" + a4.rows[0].cnt + " (expected: 0 if RLS blocking WITH CHECK)");
    if (a4.rows[0].cnt === "0") { passed++; console.log("  PASS"); }
    else { console.log("  FAIL - RLS did not block INSERT"); }
  } catch (e) {
    passed++;
    console.log("C1 - Cross-tenant INSERT: blocked by error");
    console.log("  Error: " + e.message.substring(0, 60));
  }
  
  console.log("\n" + passed + "/" + total + " RLS tests passed");
  
  await pool.end();
}

main();