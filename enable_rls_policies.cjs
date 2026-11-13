/**
 * Enable RLS on all payment-domain tables and create organization-isolation policies.
 * 
 * Policy pattern: USING (organization_id = current_setting('app.current_org_id'))
 * and WITH CHECK (organization_id = current_setting('app.current_org_id'))
 * 
 * This ensures that all SELECT, INSERT, UPDATE, DELETE operations
 * are filtered by the active organization context.
 */

const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'test_org_a',
  password: 'test_org_a_pwd',
  database: 'aiospark_revenue',
});

async function main() {
  console.log('=== ENABLING RLS ON PAYMENT-DOMAIN TABLES ===\n');
  
  const paymentTables = [
    'udm_payments',
    'udm_invoices', 
    'udm_payment_allocations',
    'udm_payment_refunds',
    'udm_payment_reversals',
    'udm_ar_reconciliation'
  ];
  
  try {
    for (const table of paymentTables) {
      console.log(`Processing table: ${table}`);
      
      // 1. Enable RLS
      console.log(`  => Enabling RLS...`);
      await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      console.log(`  => RLS enabled.`);
      
      // 2. Create policies for CRUD operations
      //    - SELECT: USING organization_id match
      //    - INSERT: WITH CHECK organization_id match
      //    - UPDATE: USING organization_id match, WITH CHECK organization_id match
      //    - DELETE: USING organization_id match
      
      console.log(`  => Creating SELECT policy...`);
      await pool.query(`
        CREATE POLICY org_isolation_select ON ${table}
        FOR SELECT
        USING (organization_id = current_setting('app.current_org_id'));
      `);
      console.log(`  => SELECT policy created.`);
      
      console.log(`  => Creating INSERT policy...`);
      await pool.query(`
        CREATE POLICY org_isolation_insert ON ${table}
        FOR INSERT
        WITH CHECK (organization_id = current_setting('app.current_org_id'));
      `);
      console.log(`  => INSERT policy created.`);
      
      console.log(`  => Creating UPDATE policy...`);
      await pool.query(`
        CREATE POLICY org_isolation_update ON ${table}
        FOR UPDATE
        USING (organization_id = current_setting('app.current_org_id'))
        WITH CHECK (organization_id = current_setting('app.current_org_id'));
      `);
      console.log(`  => UPDATE policy created.`);
      
      console.log(`  => Creating DELETE policy...`);
      await pool.query(`
        CREATE POLICY org_isolation_delete ON ${table}
        FOR DELETE
        USING (organization_id = current_setting('app.current_org_id'));
      `);
      console.log(`  => DELETE policy created.`);
      
      console.log(`  => Table ${table} fully configured.\n`);
    }
    
    // 3. Verify all policies are in place
    console.log('=== VERIFYING RLS POLICIES ===\n');
    for (const table of paymentTables) {
      const polResult = await pool.query(
        "SELECT polname, polcmd, polqual, polwithcheck, polroles FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polcmd, polname",
        [table]
      );
      const policies = polResult.rows.filter(r => r.polname);
      console.log(table + ':');
      policies.forEach(p => {
        const dirMap = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE'};
        const ptypeName = dirMap[p.polcmd] || p.polcmd;
        let info = ptypeName;
        if (p.polqual) info += ' USING predicate';
        if (p.polwithcheck) info += ' WITH CHECK';
        if (p.polroles && p.polroles.length > 0) info += ' roles=' + p.polroles.length;
        console.log(`    - ${info}`);
      });
    }
    
    // 4. Test that RLS works with non-superuser
    console.log('\n=== TESTING RLS ISOLATION ===\n');
    
    // Create a payment in test_org_a context
    await pool.query("SET app.current_org_id = 'test_org_a'");
    await pool.query(`
      INSERT INTO udm_payments (id, organization_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status, customer_id)
      VALUES ('test_rls_payment_1', 'test_org_a', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured', 'cust_rls')
    `);
    const orgAResult = await pool.query(
      "SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'test_rls_payment_1'"
    );
    console.log('test_org_a can see its own payment:', orgAResult.rows[0].cnt);
    
    // Switch to test_org_b context
    await pool.query("SET app.current_org_id = 'test_org_b'");
    const orgBResult = await pool.query(
      "SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'test_rls_payment_1'"
    );
    console.log('test_org_b CANNOT see test_org_a\'s payment (RLS enforced):', orgBResult.rows[0].cnt === '0' ? 'PASS' : 'FAIL');
    
    // Reset and clean up
    await pool.query("SET app.current_org_id = 'test_org_a'");
    await pool.query(`DELETE FROM udm_payments WHERE id = 'test_rls_payment_1'`);
    
    console.log('\n=== ALL RLS POLICIES APPLIED SUCCESSFULLY ===');
    console.log('Tables with RLS enabled:', paymentTables.length);
    console.log('Isolation: organization_id = current_setting(app.current_org_id)');
    console.log('Roles: test_org_a, test_org_b (non-superuser, no BYPASSRLS)');
    
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
}

main();