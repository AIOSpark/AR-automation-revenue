/** 
 * RLS test with pool max: 1 (forces connection reuse)
 */
const { Pool } = require('pg');

async function main() {
  console.log('=== TEST POOL MAX: 1 ===\n');
  
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue',
    max: 1  // Force single connection reuse
  });
  
  const suffix = Date.now() % 10000;
  
  // Set up data
  await pool.query("DELETE FROM udm_payments");
  await pool.query('SET app.current_org_id = ' + "'test_org_a'");
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a_" + suffix + "', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b_" + suffix + "', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  let passed = 0;
  let total = 0;
  
  // Test 1: pool.query SET org_a read own
  total++;
  await pool.query('SET app.current_org_id = ' + "'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('max:1, SET org_a read: cnt=' + r1.rows[0].cnt + ' (expected: >0)');
  if (r1.rows[0].cnt > 0) passed++;
  
  // Test 2: pool.query SET org_b read org_a (cross-tenant)
  total++;
  await pool.query('SET app.current_org_id = ' + "'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('max:1, SET org_b read org_a: cnt=' + r2.rows[0].cnt + ' (expected: 0 - blocked)');
  if (r2.rows[0].cnt === '0') passed++;
  else console.log('  >>> CROSS-TENANT LEAKAGE via pool max:1!');
  
  // Test 3: pool.query RESET fails closed
  total++;
  await pool.query('RESET app.current_org_id');
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('max:1, after RESET: cnt=' + r3.rows[0].cnt + ' (expected: 0 - fails closed)');
  if (r3.rows[0].cnt === '0') passed++;
  
  // Test 4: Cross-tenant INSERT via pool max:1
  total++;
  try {
    await pool.query('SET app.current_org_id = ' + "'test_org_b'");
    await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross_" + suffix + "', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('max:1, cross-tenant INSERT: ALLOWED (unexpected)');
  } catch (e) {
    passed++;
    console.log('max:1, cross-tenant INSERT: BLOCKED by RLS');
  }
  
  // Test 5: Own INSERT via pool max:1
  total++;
  try {
    await pool.query('SET app.current_org_id = ' + "'test_org_a'");
    const ownInsert = await pool.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own_" + suffix + "', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('max:1, own INSERT: ALLOWED (id=' + ownInsert.rows[0].id + ')');
    passed++; // Own INSERT is allowed
  } catch (e) {
    console.log('max:1, own INSERT: BLOCKED - ' + e.message.substring(0, 30));
  }
  
  // Test 6: Cross-tenant UPDATE via pool max:1
  total++;
  try {
    await pool.query('SET app.current_org_id = ' + "'test_org_b'");
    await pool.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
    console.log('max:1, cross-tenant UPDATE: ALLOWED (unexpected)');
  } catch (e) {
    passed++;
    console.log('max:1, cross-tenant UPDATE: BLOCKED by RLS');
  }
  
  // Test 7: Own UPDATE via pool max:1
  total++;
  try {
    await pool.query('SET app.current_org_id = ' + "'test_org_a'");
    await pool.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
    console.log('max:1, own UPDATE: ALLOWED (expected)');
    passed++; // Own UPDATE is allowed
  } catch (e) {
    console.log('max:1, own UPDATE: BLOCKED - ' + e.message.substring(0, 30));
  }
  
  console.log('\nPool max:1: ' + passed + '/' + total + ' passed\n');
  await pool.end();
}

main().catch(console.error);