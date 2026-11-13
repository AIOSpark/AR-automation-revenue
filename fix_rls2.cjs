/**
 * Fix RLS INSERT policies using a simple WHERE clause
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
  console.log('=== Fix RLS INSERT Policies (v2) ===\n');

  const client = await pool.connect();

  try {
    // Step 1: Try creating INSERT policy with simple qual referencing org_id
    console.log('Step 1: Creating INSERT policy with simple qual...\n');

    // First, drop any existing INSERT policy on all tables
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
        console.log('  ✓ Dropped INSERT policy on ' + table);
      } catch (e) {
        console.log('  ! Could not drop on ' + table + ': ' + e.message.substring(0, 60));
      }
    }

    // Now create INSERT policies with simple organization_id check
    console.log('\nStep 2: Creating new INSERT policies...\n');

    for (const table of tables) {
      try {
        // Use a simple WITH CHECK clause that references organization_id
        // This is the same logic the SELECT policy uses
        await client.query(
          `CREATE POLICY org_isolation_insert ON ${table} AS INSERT WITH CHECK (organization_id = current_setting('app.current_org_id'))`
        );
        console.log('  ✓ Created INSERT policy on ' + table);
      } catch (e) {
        console.log('  ! Failed on ' + table + ': ' + e.message.substring(0, 80));
      }
    }

    // Step 3: Verify all policies
    console.log('\nStep 3: Verifying all policies...\n');
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
      polys.rows.forEach(p => {
        const hasQual = p.polqual ? 'HAS QUAL' : 'NO QUAL';
        console.log('  ' + p.polname + ' (' + p.polcmd + '): ' + hasQual);
        if (p.polname === 'org_isolation_insert' && !p.polqual) {
          allPassed = false;
        }
      });
    }

    // Step 4: Test cross-tenant INSERT
    console.log('\nStep 4: Testing cross-tenant INSERT...\n');

    // Insert as test_org_b
    await client.query(`SET app.current_org_id = 'test_org_b'`);
    await client.query(`
      INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) 
      VALUES ('pay_org_b_v2', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')
    `);

    // Try insert as test_org_a - should be blocked by RLS
    await client.query(`SET app.current_org_id = 'test_org_a'`);
    const crossInsert = await client.query(`
      INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) 
      VALUES ('pay_cross_tenant_v2', 'test_org_a', 'cross', 'manual', 'cross', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')
    `);

    const check = await client.query(`SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross_tenant_v2'`);
    const cnt = parseInt(check.rows[0].cnt);

    if (cnt === 0) {
      console.log('✓ SUCCESS: Cross-tenant INSERT blocked by RLS!\n');
    } else {
      console.log('✗ FAIL: Cross-tenant INSERT not blocked. Count:', cnt, '\n');
      allPassed = false;
    }

    // Clean up test data
    await client.query(`SET app.current_org_id = 'test_org_b'`);
    await client.query(`DELETE FROM udm_payments WHERE id = 'pay_org_b_v2'`);
    await client.query(`SET app.current_org_id = 'test_org_a'`);
    await client.query(`DELETE FROM udm_payments WHERE id = 'pay_cross_tenant_v2'`);

    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('RESULT: All INSERT policies now HAVE QUALIFICATIONS ✅');
      console.log('        Cross-tenant INSERT properly blocked ✅');
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