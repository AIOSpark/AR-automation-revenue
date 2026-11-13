/** 
 * RLS test with same-client pattern on pool max:1
 */
const { Pool } = require('pg');

async function main() {
  console.log('=== TEST SAME CLIENT on pool max:1 ===\n');
  
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue',
    max: 1  // Force single connection reuse
  });
  
  const suffix = Date.now() % 10000;
  
  // Set up data using same client
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM udm_payments");
    
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a_" + suffix + "', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b_" + suffix + "', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    let passed = 0;
    let total = 0;
    
    // Test 1: Same client, org_a read own
    total++;
    const r1 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('same-client max:1, org_a read: cnt=' + r1.rows[0].cnt + ' (expected: >0)');
    if (r1.rows[0].cnt > 0) passed++;
    
    // Test 2: Same client, org_b read org_a (cross-tenant)
    total++;
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    const r2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('same-client max:1, org_b read org_a: cnt=' + r2.rows[0].cnt + ' (expected: 0 - RLS blocked)');
    if (r2.rows[0].cnt === '0') passed++;
    else console.log('  >>> CROSS-TENANT LEAKAGE!');
    
    // Test 3: Same client, RESET fails closed
    total++;
    await client.query('RESET app.current_org_id');
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('same-client max:1, after RESET: cnt=' + r3.rows[0].cnt + ' (expected: 0 - fails closed)');
    if (r3.rows[0].cnt === '0') passed++;
    
    // Test 4: Same client, cross-tenant INSERT blocked
    total++;
    try {
      await client.query('SET app.current_org_id = ' + "'test_org_b'");
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross_" + suffix + "', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log('same-client max:1, cross-tenant INSERT: ALLOWED (unexpected)');
    } catch (e) {
      passed++;
      console.log('same-client max:1, cross-tenant INSERT: BLOCKED by RLS');
    }
    
    // Test 5: Same client, own INSERT allowed
    total++;
    const ownInsert = await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own_" + suffix + "', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('same-client max:1, own INSERT: ALLOWED (id=' + ownInsert.rows[0].id + ')');
    passed++; // Own INSERT is allowed
    
    // Test 6: Same client, cross-tenant UPDATE blocked
    total++;
    try {
      await client.query('SET app.current_org_id = ' + "'test_org_b'");
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
      console.log('same-client max:1, cross-tenant UPDATE: ALLOWED (unexpected)');
    } catch (e) {
      passed++;
      console.log('same-client max:1, cross-tenant UPDATE: BLOCKED by RLS');
    }
    
    // Test 7: Same client, own UPDATE allowed
    total++;
    try {
      await client.query('SET app.current_org_id = ' + "'test_org_a'");
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
      console.log('same-client max:1, own UPDATE: ALLOWED (expected)');
      passed++; // Own UPDATE is allowed
    } catch (e) {
      console.log('same-client max:1, own UPDATE: BLOCKED - ' + e.message.substring(0, 30));
    }
    
    console.log('\nSame-client max:1: ' + passed + '/' + total + ' passed\n');
  } finally {
    client.release();
  }
  
  await pool.end();
}

main().catch(console.error);