/** 
 * Compare RLS enforcement using pool.query() vs same-client pattern
 */
const { Pool } = require('pg');

// Test A: Using pool.query() (different clients each time)
async function testPoolPattern() {
  console.log('=== TEST POOL PATTERN (pool.query()) ===\n');
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  await pool.query('DELETE FROM udm_payments WHERE organization_id IN ($1, $2)', ['test_org_a', 'test_org_b']);
  
  // Insert payments for both orgs
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  let passed = 0;
  let total = 0;
  
  // Test: test_org_a can read own payment using pool.query()
  total++;
  await pool.query('SET app.current_org_id = $1', ['test_org_a']);
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('pool.query: test_org_a reading own payments, cnt=' + r1.rows[0].cnt + (r1.rows[0].cnt > 0 ? ' (own data visible)' : ' (blocked)'));
  if (r1.rows[0].cnt > 0) passed++;
  
  // Test: test_org_b cannot read test_org_a's payment using pool.query()
  total++;
  await pool.query('SET app.current_org_id = $1', ['test_org_b']);
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('pool.query: test_org_b reading org_a payments, cnt=' + r2.rows[0].cnt + (r2.rows[0].cnt === '0' ? ' (blocked)' : ' (LEAK!)'));
  if (r2.rows[0].cnt === '0') passed++;
  else console.log('  >>> CROSS-TENANT LEAKAGE via pool.query!');
  
  // Test: test_org_a can read own payment after resetting
  total++;
  await pool.query('SET app.current_org_id = $1', ['test_org_a']);
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('pool.query: test_org_a reading own after reset, cnt=' + r3.rows[0].cnt);
  if (r3.rows[0].cnt > 0) passed++;
  
  console.log('Pool pattern: ' + passed + '/' + total + ' passed\n');
  await pool.end();
}

// Test B: Using same client pattern (pool.connect(), SET on client, all queries on same client)
async function testSameClientPattern() {
  console.log('=== TEST SAME CLIENT PATTERN ===\n');
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  await pool.query('DELETE FROM udm_payments WHERE organization_id IN ($1, $2)', ['test_org_a', 'test_org_b']);
  
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  let passed = 0;
  let total = 0;
  
  // CRITICAL: Use the SAME client for SET and all queries
  const client = await pool.connect();
  
  try {
    // Test: test_org_a can read own payment using same client
    total++;
    await client.query('SET app.current_org_id = $1', ['test_org_a']);
    const r1 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('same-client: test_org_a reading own payments, cnt=' + r1.rows[0].cnt + (r1.rows[0].cnt > 0 ? ' (own data visible)' : ' (blocked)'));
    if (r1.rows[0].cnt > 0) passed++;
    
    // Test: test_org_b cannot read test_org_a's payment using same client
    total++;
    await client.query('SET app.current_org_id = $1', ['test_org_b']);
    const r2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('same-client: test_org_b reading org_a payments, cnt=' + r2.rows[0].cnt + (r2.rows[0].cnt === '0' ? ' (blocked)' : ' (LEAK!)'));
    if (r2.rows[0].cnt === '0') passed++;
    else console.log('  >>> CROSS-TENANT LEAKAGE via same-client!');
    
    // Test: test_org_a can read own payment after resetting
    total++;
    await client.query('SET app.current_org_id = $1', ['test_org_a']);
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('same-client: test_org_a reading own after reset, cnt=' + r3.rows[0].cnt);
    if (r3.rows[0].cnt > 0) passed++;
    
  } finally {
    client.release();
  }
  
  console.log('Same-client pattern: ' + passed + '/' + total + ' passed\n');
  await pool.end();
}

async function main() {
  await testPoolPattern();
  await testSameClientPattern();
}

main().catch(console.error);