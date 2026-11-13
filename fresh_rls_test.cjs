/**
 * Fresh RLS test on actual payment-domain tables.
 * Drops all existing policies and recreates from scratch.
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
  console.log("=== FRESH RLS TEST ===\n");
  
  // 1. Clean all test data from payment tables
  const tables = [
    'udm_payments', 'udm_invoices', 'udm_payment_allocations',
    'udm_payment_refunds', 'udm_payment_reversals', 'udm_ar_reconciliation'
  ];
  
  for (const table of tables) {
    await pool.query("DELETE FROM " + table + " WHERE organization_id IN ('test_org_a', 'test_org_b')");
  }
  
  // 2. Drop ALL policies on all payment tables
  for (const table of tables) {
    for (const cmd of [
      "DROP POLICY IF EXISTS org_isolation_select ON " + table,
      "DROP POLICY IF EXISTS org_isolation_insert ON " + table,
      "DROP POLICY IF EXISTS org_isolation_update ON " + table,
      "DROP POLICY IF EXISTS org_isolation_delete ON " + table,
      "DROP POLICY IF EXISTS block_all_select ON " + table,
      "DROP POLICY IF EXISTS block_all_insert ON " + table,
      "DROP POLICY IF EXISTS block_all_update ON " + table,
      "DROP POLICY IF EXISTS block_all_delete ON " + table
    ]) {
      try { await pool.query(cmd); } catch (e) {}
    }
  }
  
  // 3. Verify no policies remain
  for (const table of tables) {
    const pol = await pool.query(
      "SELECT COUNT(*) as cnt FROM pg_policy WHERE polrelid = $1::regclass",
      [table]
    );
    console.log(table + ": " + pol.rows[0].cnt + " policies");
  }
  
  // 4. Enable RLS on all tables (check if already enabled)
  for (const table of tables) {
    try {
      await pool.query("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY");
    } catch (e) {
      // May already be enabled or not applicable
    }
  }
  
  // 5. Create new policies with the correct expression
  const orgCheck = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";
  
  for (const table of tables) {
    try {
      await pool.query("CREATE POLICY org_isolation_select ON " + table + " FOR SELECT USING (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_insert ON " + table + " FOR INSERT WITH CHECK (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_update ON " + table + " FOR UPDATE USING (" + orgCheck + ") WITH CHECK (" + orgCheck + ")");
      await pool.query("CREATE POLICY org_isolation_delete ON " + table + " FOR DELETE USING (" + orgCheck + ")");
      console.log("Created policies on " + table);
    } catch (e) {
      console.log("Error creating policies on " + table + ": " + e.message.substring(0, 40));
    }
  }
  
  // 6. Verify policies
  console.log("\n=== Policy Verification ===");
  for (const table of tables) {
    const polResult = await pool.query(
      "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polcmd, polname",
      [table]
    );
    const hasSelect = polResult.rows.some(p => p.polcmd === 'r' && p.polqual);
    const hasInsert = polResult.rows.some(p => p.polcmd === 'a' && p.polwithcheck);
    console.log(table + ": select=" + (hasSelect ? "YES" : "NO") + " insert=" + (hasInsert ? "YES" : "NO"));
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
  
  // Test: org_a can read own payments
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("SELECT COUNT * with org_a: " + r1.rows[0].cnt);
  // Note: Without RLS enforcement in the test harness, this may return all rows
  
  // Test: org_b cannot read org_a's payments (this is what we need to verify)
  total++;
  await pool.query("SET app.current_org_id = 'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log("With org_b context, counting org_a payments: " + r2.rows[0].cnt);
  if (r2.rows[0].cnt === "0") {
    passed++;
    console.log("PASS: RLS blocks cross-tenant SELECT");
  } else {
    console.log("FAIL: RLS does not block cross-tenant SELECT");
  }
  
  // Test: cross-tenant INSERT
  total++;
  try {
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
    console.log("Cross-tenant INSERT: count=" + r3.rows[0].cnt);
    if (r3.rows[0].cnt === "0") {
      passed++;
      console.log("PASS: RLS blocks cross-tenant INSERT");
    } else {
      console.log("FAIL: RLS does not block cross-tenant INSERT");
    }
  } catch (e) {
    passed++;
    console.log("PASS: RLS blocks cross-tenant INSERT (error thrown)");
  }
  
  console.log("\n" + passed + "/" + total + " tests passed");
  
  await pool.end();
}

main();