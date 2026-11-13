/**
 * Fix RLS INSERT policies - create with simple WHERE clause
 * Using chr() function to avoid string escaping issues
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
  console.log('=== Fix RLS INSERT Policies (v3) ===\n');

  const client = await pool.connect();

  try {
    // Step 1: First check what policies exist and their exact names
    console.log('Step 1: Checking existing policies...\n');
    const tables = [
      'udm_payments',
      'udm_invoices',
      'udm_payment_allocations',
      'udm_payment_refunds',
      'udm_payment_reversals',
      'udm_ar_reconciliation'
    ];

    for (const table of tables) {
      const polys = await client.query(
        "SELECT polname, polcmd, polqual FROM pg_policy WHERE polrelid = $1::regclass",
        [table]
      );
      console.log('=== ' + table + ' ===');
      polys.rows.forEach(p => {
        console.log('  ' + p.polname + ' (' + p.polcmd + '): ' + (p.polqual ? 'HAS QUAL' : 'NO QUAL'));
      });
    }

    // Step 2: Drop existing INSERT policies if they exist
    console.log('\nStep 2: Dropping existing INSERT policies...\n');
    for (const table of tables) {
      try {
        // Use IF NOT EXISTS equivalent - just try drop and ignore "does not exist"
        const dropSql = `DROP POLICY IF EXISTS org_isolation_insert ON ${table}`;
        await client.query(dropSql);
        console.log('  ✓ Dropped INSERT policy on ' + table);
      } catch (e) {
        console.log('  ! Error dropping on ' + table + ': ' + e.message.substring(0, 60));
      }
    }

    // Step 3: Create new INSERT policies with simple organization_id check
    console.log('\nStep 3: Creating new INSERT policies with organization_id check...\n');

    // Build the qualification string using chr() to avoid quoting issues
    // current_setting('app.current_org_id') checks the org context
    const orgIdCheck = "organization_id = current_setting('app.current_org_id')";

    for (const table of tables) {
      try {
        const createSql = `CREATE POLICY org_isolation_insert ON ${table} AS INSERT WITH CHECK ${orgIdCheck}`;
        await client.query(createSql);
        console.log('  ✓ Created INSERT policy on ' + table);
      } catch (e) {
        console.log('  ! Failed on ' + table + ': ' + e.message.substring(0, 100));
      }
    }

    // Step 4: Verify all policies
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
      polys.rows.forEach(p => {
        const hasQual = p.polqual ? 'HAS QUAL' : 'NO QUAL';
        console.log('  ' + p.polname + ' (' + p.polcmd + '): ' + hasQual);
        if (p.polname === 'org_isolation_insert' && !p.polqual) {
          allPassed = false;
        }
      });
    }

    // Step 5: Test cross-tenant INSERT
    console.log('\nStep 5: Testing cross-tenant INSERT...\n');

    // Insert as test_org_b
    await client.query(`SET app.current_org_id = 'test_org_b'`);
    await client.query(`
      INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) 
      VALUES ('pay_org_b_v3', 'test_org_b', 'cust_b', 'manual', 'manual_b', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')
    `);

    // Try insert as test_org_a - should be blocked by RLS
    await client.query(`SET app.current_org_id = 'test_org_a'`);
    const crossInsert = await client.query(`
      INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) 
      VALUES ('pay_cross_tenant_v3', 'test_org_a', 'cross', 'manual', 'cross', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')
    `);

    const check = await client.query(`SELECT COUNT(*) as cnt FROM udm_payments WHERE id = 'pay_cross_tenant_v3'`);
    const cnt = parseInt(check.rows[0].cnt);

    if (cnt === 0) {
      console.log('✓ SUCCESS: Cross-tenant INSERT blocked by RLS!\n');
    } else {
      console.log('✗ FAIL: Cross-tenant INSERT not blocked. Count:', cnt, '\n');
      allPassed = false;
    }

    // Clean up test data
    await client.query(`SET app.current_org_id = 'test_org_b'`);
    await client.query(`DELETE FROM udm_payments WHERE id = 'pay_org_b_v3'`);
    await client.query(`SET app.current_org_id = 'test_org_a'`);
    await client.query(`DELETE FROM udm_payments WHERE id = 'pay_cross_tenant_v3'`);

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
    console.log('Stack:', err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main();