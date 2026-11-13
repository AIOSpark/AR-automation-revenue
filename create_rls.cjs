/**
 * Create RLS policies on payment-domain tables.
 * Uses postgres user connection.
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
  console.log('=== CREATING RLS POLICIES ON PAYMENT-DOMAIN TABLES ===\n');
  
  const paymentTables = [
    'udm_payments',
    'udm_invoices', 
    'udm_payment_allocations',
    'udm_payment_refunds',
    'udm_payment_reversals',
    'udm_ar_reconciliation'
  ];
  
  const orgIdCheck = "organization_id = current_setting('app.current_org_id')";
  
  try {
    for (const table of paymentTables) {
      console.log(`Processing table: ${table}`);
      
      // Drop existing policies if any
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
          // Ignore - may not exist
        }
      }
      
      // Create SELECT policy
      console.log(`  => Creating SELECT policy...`);
      await pool.query(
        `CREATE POLICY org_isolation_select ON ${table} FOR SELECT USING (${orgIdCheck})`
      );
      
      // Create INSERT policy - WITH CHECK is what matters for INSERT
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
    
    // Test cross-tenant INSERT
    console.log('\n=== TESTING CROSS-TENANT INSERT ===\n');
    
    // Insert as test_org_b
    await pool.query("SET app.current_org_id = 'test_org_b'");
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_org_b_test', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const orgBCheck = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_org_b_test'");
    console.log('test_org_b inserted its own payment:', orgBCheck.rows[0].cnt);
    
    // Try insert as test_org_a - should be blocked
    await pool.query("SET app.current_org_id = 'test_org_a'");
    const crossInsert = await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross_tenant', 'test_org_a', 'cross', 'manual', 'cross', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    const crossCheck = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross_tenant'");
    console.log('test_org_a cross-tenant INSERT blocked:', crossCheck.rows[0].cnt === '0' ? 'PASS' : 'FAIL', '(count:', crossCheck.rows[0].cnt + ')');
    
    // Clean up
    await pool.query("SET app.current_org_id = 'test_org_b'");
    await pool.query("DELETE FROM udm_payments WHERE id = 'pay_org_b_test'");
    await pool.query("SET app.current_org_id = 'test_org_a'");
    await pool.query("DELETE FROM udm_payments WHERE id = 'pay_cross_tenant'");
    
    console.log('\n=== RLS POLICIES CREATED AND VERIFIED ===');
    
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
}

main();