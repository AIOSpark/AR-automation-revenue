/**
 * Recreate RLS policies on payment-domain tables with correct expression.
 * Uses: NULLIF(current_setting('app.current_org_id', true), '') 
 * (without ::uuid cast, since organization_id is text)
 */

const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'aiospark_revenue',
});

async function main() {
  console.log('=== RECREATING RLS POLICIES WITH CORRECT EXPRESSION ===\n');
  
  const paymentTables = [
    'udm_payments',
    'udm_invoices', 
    'udm_payment_allocations',
    'udm_payment_refunds',
    'udm_payment_reversals',
    'udm_ar_reconciliation'
  ];
  
  // Correct policy expression: organization_id matches the current org context
  // NULLIF(current_setting(..., true), '') returns NULL if the parameter is not set,
  // otherwise returns the parameter value. We compare organization_id (text) with this value.
  const orgIdCheck = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";
  
  try {
    for (const table of paymentTables) {
      console.log(`Processing table: ${table}`);
      
      // Drop existing policies
      console.log(`  => Dropping existing policies...`);
      for (const cmd of [
        `DROP POLICY IF EXISTS org_isolation_select ON ${table}`,
        `DROP POLICY IF EXISTS org_isolation_insert ON ${table}`,
        `DROP POLICY IF EXISTS org_isolation_update ON ${table}`,
        `DROP POLICY IF EXISTS org_isolation_delete ON ${table}`
      ]) {
        try {
          await pool.query(cmd);
        } catch (e) {
          // Ignore
        }
      }
      
      // Create SELECT policy
      console.log(`  => Creating SELECT policy...`);
      await pool.query(
        `CREATE POLICY org_isolation_select ON ${table} FOR SELECT USING (${orgIdCheck})`
      );
      
      // Create INSERT policy WITH CHECK
      console.log(`  => Creating INSERT policy...`);
      await pool.query(
        `CREATE POLICY org_isolation_insert ON ${table} FOR INSERT WITH CHECK (${orgIdCheck})`
      );
      
      // Create UPDATE policy
      console.log(`  => Creating UPDATE policy...`);
      await pool.query(
        `CREATE POLICY org_isolation_update ON ${table} FOR UPDATE USING (${orgIdCheck}) WITH CHECK (${orgIdCheck})`
      );
      
      // Create DELETE policy
      console.log(`  => Creating DELETE policy...`);
      await pool.query(
        `CREATE POLICY org_isolation_delete ON ${table} FOR DELETE USING (${orgIdCheck})`
      );
      
      console.log(`  => Table ${table} configured.\n`);
    }
    
    // Verify all policies
    console.log('=== VERIFYING ALL POLICIES ===\n');
    for (const table of paymentTables) {
      const polResult = await pool.query(
        "SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polcmd, polname",
        [table]
      );
      console.log(table + ':');
      polResult.rows.forEach(p => {
        const cmdMap = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE'};
        const ptype = cmdMap[p.polcmd] || p.polcmd;
        let hasQual = p.polqual ? 'HAS QUAL' : 'NO QUAL';
        let hasWCheck = p.polwithcheck ? 'HAS WCHECK' : 'NO WCHECK';
        console.log(`  ${ptype}: ${p.polname} - ${hasQual}, ${hasWCheck}`);
      });
    }
    
    // Test RLS isolation
    console.log('\n=== TESTING RLS ISOLATION ===\n');
    
    // Ensure clean state
    await pool.query("SET app.current_org_id = 'test_org_a'");
    await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
    await pool.query("DELETE FROM udm_invoices WHERE organization_id IN ('test_org_a', 'test_org_b')");
    
    let passed = 0;
    let total = 0;
    
    // Test 1: test_org_a can INSERT its own payments
    total++;
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a1', 'test_org_a', 'cust_a', 'manual', 'manual_a', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    let r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_a1'");
    if (r.rows[0].cnt === "1") { passed++; console.log("Test 1 PASS: org_a inserts own payment"); }
    else console.log("Test 1 FAIL: org_a inserts own payment, count=" + r.rows[0].cnt);
    
    // Test 2: test_org_b cannot INSERT with org_id = test_org_a (cross-tenant)
    total++;
    await pool.query("SET app.current_org_id = 'test_org_b'");
    await pool.query("DELETE FROM udm_payments WHERE id = 'pay_cross'");
    try {
      await pool.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual_c', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
      if (r.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: org_b cross-tenant INSERT blocked by RLS"); }
      else console.log("Test 2 FAIL: org_b cross-tenant INSERT not blocked, count=" + r.rows[0].cnt);
    } catch (e) {
      r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross'");
      if (r.rows[0].cnt === "0") { passed++; console.log("Test 2 PASS: org_b cross-tenant INSERT blocked (error)"); }
      else console.log("Test 2 PARTIAL: error, count=" + r.rows[0].cnt);
    }
    
    // Test 3: test_org_a can SELECT its own payments
    total++;
    await pool.query("SET app.current_org_id = 'test_org_a'");
    r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    if (r.rows[0].cnt > 0) { passed++; console.log("Test 3 PASS: org_a can select own payments"); }
    else console.log("Test 3 FAIL: org_a cannot select own payments, count=" + r.rows[0].cnt);
    
    // Test 4: test_org_b cannot SELECT test_org_a's payments (RLS)
    total++;
    await pool.query("SET app.current_org_id = 'test_org_b'");
    r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    if (r.rows[0].cnt === "0") { passed++; console.log("Test 4 PASS: org_b cannot select org_a payments (RLS)"); }
    else console.log("Test 4 FAIL: org_b can select org_a payments, count=" + r.rows[0].cnt);
    
    // Test 5: test_org_b can INSERT its own payments
    total++;
    await pool.query("SET app.current_org_id = 'test_org_b'");
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b1', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_b1'");
    if (r.rows[0].cnt === "1") { passed++; console.log("Test 5 PASS: org_b inserts own payment"); }
    else console.log("Test 5 FAIL: org_b inserts own payment, count=" + r.rows[0].cnt);
    
    // Test 6: test_org_a cannot SELECT test_org_b's payments
    total++;
    await pool.query("SET app.current_org_id = 'test_org_a'");
    r = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_b'");
    if (r.rows[0].cnt === "0") { passed++; console.log("Test 6 PASS: org_a cannot select org_b payments (RLS)"); }
    else console.log("Test 6 FAIL: org_a can select org_b payments, count=" + r.rows[0].cnt);
    
    console.log(`\n${passed}/${total} RLS isolation tests passed`);
    
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
}

main();