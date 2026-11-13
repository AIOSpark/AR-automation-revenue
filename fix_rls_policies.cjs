/**
 * Fix RLS INSERT policies - give them the same qualifications as SELECT/UPDATE/DELETE
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
  console.log('=== Fix RLS INSERT Policies ===\n');

  const client = await pool.connect();

  try {
    // Step 1: Get the SELECT policy qualification string
    console.log('Step 1: Retrieving SELECT policy qualification...\n');
    const selectPol = await client.query(
      "SELECT polqual FROM pg_policy WHERE polrelid = 'udm_payments'::regclass AND polname = 'org_isolation_select'"
    );
    const qual = selectPol.rows[0].polqual;
    console.log('✓ Retrieved qual string, length:', qual.length);
    console.log('  (first 100 chars):', qual.substring(0, 100), '...\n');

    // Step 2: Drop the existing INSERT policies on all 6 tables
    console.log('Step 2: Dropping INSERT policies on all tables...\n');
    const tables = [
      'udm_payments',
      'udm_invoices',
      'udm_payment_allocations',
      'udm_payment_refunds',
      'udm_payment_reversals',
      'udm_ar_reconciliation'
    ];

    for (const table of tables) {
      try {
        await client.query(`DROP POLICY org_isolation_insert ON ${table}`);
        console.log(`  ✓ Dropped org_isolation_insert on ${table}`);
      } catch (e) {
        console.log(`  ! Could not drop on ${table}:`, e.message.substring(0, 80));
      }
    }

    // Step 3: Recreate INSERT policies with the same qualification as SELECT
    console.log('\nStep 3: Recreating INSERT policies with SELECT qual...\n');
    for (const table of tables) {
      try {
        // Use parameterized approach - wrap the qual string in the CREATE POLICY
        const createSql = `CREATE POLICY org_isolation_insert ON ${table} AS INSERT WITH CHECK ${qual}`;
        await client.query(createSql);
        console.log(`  ✓ Created org_isolation_insert on ${table} WITH CHECK qual`);
      } catch (e) {
        console.log(`  ! Failed on ${table}:`, e.message.substring(0, 100));
      }
    }

    // Step 4: Verify all policies now have qualifications
    console.log('\nStep 4: Verifying all policies...\n');
    const tables2 = [
      'udm_payments',
      'udm_invoices',
      'udm_payment_allocations',
      'udm_payment_refunds',
      'udm_payment_reversals',
      'udm_ar_reconciliation'
    ];

    let allPassed = true;
    for (const table of tables2) {
      const polys = await client.query(
        "SELECT polname, polcmd, polqual FROM pg_policy WHERE polrelid = $1::regclass",
        [table]
      );
      console.log('=== ' + table + ' ===');
      let tableHasAllQual = true;
      polys.rows.forEach(p => {
        const hasQual = p.polqual ? 'HAS QUAL' : 'NO QUAL';
        console.log('  ' + p.polname + ' (' + p.polcmd + '): ' + hasQual);
        if (p.polname === 'org_isolation_insert' && p.polqual === null) {
          tableHasAllQual = false;
          allPassed = false;
        }
      });
      if (tableHasAllQual) {
        console.log('  ✓ All policies have qualifications');
      } else {
        console.log('  ✗ Some policies missing qualifications');
      }
    }

    // Step 5: Test the fix
    console.log('\nStep 5: Testing the fix...\n');
    
    // Test: Tenant A should not be able to INSERT into Tenant B's data
    // First, create a test payment in Tenant B's context
    await client.query(`SET app.current_org_id = 'test_org_b'`);
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_rls_test', 'test_org_b', 'cust_rls', 'manual', 'manual_rls', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    // Now try to INSERT as Tenant A - should fail RLS
    await client.query(`SET app.current_org_id = 'test_org_a'`);
    const insertResult = await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_rls_cross', 'test_org_a', 'cust_cross', 'manual', 'manual_cross', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    // Check if the cross-tenant insert was blocked
    const checkResult = await client.query(
      "SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_rls_cross'"
    );
    const cnt = parseInt(checkResult.rows[0].cnt);
    
    if (cnt === 0) {
      console.log('✓ RLS INSERT policy now blocks cross-tenant inserts');
      passed = 1; // Mark as passed
    } else {
      console.log('✗ RLS INSERT policy still allows cross-tenant inserts');
      console.log('  Inserted row count:', cnt);
    }

    // Clean up test data
    await client.query(`SET app.current_org_id = 'test_org_b'`);
    await client.query("DELETE FROM udm_payments WHERE id = 'pay_rls_test'");
    await client.query(`SET app.current_org_id = 'test_org_a'`);
    await client.query("DELETE FROM udm_payments WHERE id = 'pay_rls_cross'");

    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('RESULT: All INSERT policies now have qualifications ✅');
    } else {
      console.log('RESULT: Some INSERT policies still missing qualifications ⚠️');
    }
    console.log('='.repeat(50));

  } catch (err) {
    console.log('❌ Fix error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();