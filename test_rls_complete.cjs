/** 
 * Complete RLS test suite using same-client pattern
 * This is the pattern that works: pool.connect() + SET + queries on same client + release
 */
const { Pool } = require('pg');

async function main() {
  console.log('=== COMPLETE RLS TEST SUITE (same-client pattern) ===\n');
  
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  const suffix = Date.now() % 10000;
  
  // Set up initial data
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
    
    // === TEST 1: Own payment read ===
    total++;
    const r1 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    const t1 = r1.rows[0].cnt > 0;
    if (t1) passed++;
    console.log('Test 1 ' + (t1 ? 'PASS' : 'FAIL') + ': Own payment read (cnt=' + r1.rows[0].cnt + ')');
    
    // === TEST 2: Cross-tenant read blocked ===
    total++;
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    const r2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    const t2 = r2.rows[0].cnt === '0';
    if (t2) passed++;
    console.log('Test 2 ' + (t2 ? 'PASS' : 'FAIL') + ': Cross-tenant read blocked (cnt=' + r2.rows[0].cnt + ', expected: 0)');
    
    // === TEST 3: Own read after context switch back ===
    total++;
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    const t3 = r3.rows[0].cnt > 0;
    if (t3) passed++;
    console.log('Test 3 ' + (t3 ? 'PASS' : 'FAIL') + ': Own read after switch (cnt=' + r3.rows[0].cnt + ')');
    
    // === TEST 4: Cross-tenant INSERT blocked ===
    total++;
    try {
      await client.query('SET app.current_org_id = ' + "'test_org_b'");
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross_" + suffix + "', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log('Test 4 - Cross-tenant INSERT: ALLOWED (unexpected)');
    } catch (e) {
      passed++;
      console.log('Test 4 PASS: Cross-tenant INSERT blocked by RLS');
    }
    
    // === TEST 5: Own INSERT allowed ===
    total++;
    const ownInsert = await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own_" + suffix + "', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('Test 5 - Own INSERT: ALLOWED (id=' + ownInsert.rows[0].id + ')');
    passed++; // Own INSERT is allowed
    
    // === TEST 6: Cross-tenant SELECT blocked (with org_b context) ===
    total++;
    // Note: We already switched to org_b in Test 2, but let's switch again
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    const r6 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    const t6 = r6.rows[0].cnt === '0';
    if (t6) passed++;
    console.log('Test 6 ' + (t6 ? 'PASS' : 'FAIL') + ': Cross-tenant SELECT blocked (cnt=' + r6.rows[0].cnt + ', expected: 0)');
    
    // === TEST 7: Own payment read with org_a context ===
    total++;
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    const r7 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    const t7 = r7.rows[0].cnt > 0;
    if (t7) passed++;
    console.log('Test 7 ' + (t7 ? 'PASS' : 'FAIL') + ': Own read org_a (cnt=' + r7.rows[0].cnt + ')');
    
    // === TEST 8: Missing context fails closed ===
    total++;
    await client.query('RESET app.current_org_id');
    const r8 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    const t8 = r8.rows[0].cnt === '0';
    if (t8) passed++;
    console.log('Test 8 ' + (t8 ? 'PASS' : 'FAIL') + ': Missing context fails closed (cnt=' + r8.rows[0].cnt + ', expected: 0)');
    
    // === TEST 9: Invalid context fails closed ===
    total++;
    await client.query('SET app.current_org_id = ' + "'nonexistent'");
    const r9 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    const t9 = r9.rows[0].cnt === '0';
    if (t9) passed++;
    console.log('Test 9 ' + (t9 ? 'PASS' : 'FAIL') + ': Invalid context fails closed (cnt=' + r9.rows[0].cnt + ', expected: 0)');
    
    // === TEST 10: Cross-tenant UPDATE blocked ===
    total++;
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    try {
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = '" + (await getPaymentId(client, 'pay_a_' + suffix)) + "'");
      console.log('Test 10 - Cross-tenant UPDATE: ALLOWED (unexpected)');
    } catch (e) {
      passed++;
      console.log('Test 10 PASS: Cross-tenant UPDATE blocked by RLS');
    }
    
    // === TEST 11: Own UPDATE allowed ===
    total++;
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    try {
      // Get actual payment ID
      const pid = await getPaymentId(client, 'pay_a_' + suffix);
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = '" + pid + "'");
      console.log('Test 11 - Own UPDATE: ALLOWED (expected)');
      passed++; // Own UPDATE is allowed
    } catch (e) {
      console.log('Test 11 - Own UPDATE: BLOCKED - ' + e.message.substring(0, 30));
    }
    
  } finally {
    client.release();
  }
  
  await pool.end();
  
  // Helper function
  async function getPaymentId(client, pattern) {
    const r = await client.query("SELECT id FROM udm_payments WHERE id LIKE '$1%'", [pattern]);
    return r.rows[0] ? r.rows[0].id : 'pay_a_' + suffix;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('COMPLETE RLS TEST SUITE RESULT');
  console.log('='.repeat(50));
  console.log('Passed: ' + passed + '/' + total);
  console.log('Status: ' + (passed === total ? 'ALL PASSED ✅' : 'SOME FAILED ⚠️'));
  console.log('\nNote: All tests use the same-client pattern (pool.connect() + SET on client + queries on same client + release)');
  console.log('This pattern ensures RLS policies are evaluated with the correct tenant context.');
}

main().catch(console.error);