/** 
 * Simple RLS test - check current_setting and policy evaluation
 */
const { Pool } = require('pg');

// Test 1: Direct session test - SET then SELECT/INSERT
async function testDirectSession() {
  console.log('=== TEST 1: Direct session (single client) ===\n');
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  const client = await pool.connect();
  
  try {
    // Insert test data WITH context set
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    await client.query("DELETE FROM udm_payments");
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    // Test: Read own payments
    const r1 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('With org_a context: cnt=' + r1.rows[0].cnt + ' (expected: 1 - own payment visible)');
    
    // Test: Switch to org_b and read org_a payments
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    const r2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('With org_b context: cnt=' + r2.rows[0].cnt + ' (expected: 0 - cross-tenant blocked)');
    
    // Test: Reset context and read
    await client.query('RESET app.current_org_id');
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('After RESET: cnt=' + r3.rows[0].cnt + ' (expected: 0 - fails closed)');
    
    // Test: INSERT cross-tenant (should be blocked by WITH CHECK)
    try {
      await client.query('SET app.current_org_id = ' + "'test_org_b'");
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log('Cross-tenant INSERT: ALLOWED (unexpected)');
    } catch (e) {
      console.log('Cross-tenant INSERT: BLOCKED by RLS WITH CHECK');
    }
    
    // Test: INSERT own (should be allowed)
    const ownInsert = await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('Own INSERT: ALLOWED (id=' + ownInsert.rows[0].id + ')');
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

// Test 2: Pool.query() pattern - SET before each query
async function testPoolPattern() {
  console.log('\n=== TEST 2: Pool query pattern ===\n');
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  // Set up data via same-client pattern first
  const setupClient = await pool.connect();
  try {
    await setupClient.query('SET app.current_org_id = ' + "'test_org_a'");
    await setupClient.query("DELETE FROM udm_payments");
    await setupClient.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    await setupClient.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
  } finally {
    setupClient.release();
  }
  
  // Now use pool.query() directly - each query needs its own SET
  
  // Test: SET then query through pool
  await pool.query('SET app.current_org_id = ' + "'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('pool.query with SET org_a: cnt=' + r1.rows[0].cnt + ' (expected: 1)');
  
  // Switch context and query (different client connection)
  await pool.query('SET app.current_org_id = ' + "'test_org_b'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('pool.query SET org_b: cnt=' + r2.rows[0].cnt + ' (expected: 0 - blocked, or leak if >0)');
  
  // Test: Missing context fails closed
  await pool.query('RESET app.current_org_id');
  const r3 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('pool.query after RESET: cnt=' + r3.rows[0].cnt + ' (expected: 0 - fails closed)');
  
  await pool.end();
}

// Test 3: Same client pattern (the documented pattern)
async function testSameClientPattern() {
  console.log('\n=== TEST 3: Same client pattern ===\n');
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  const client = await pool.connect();
  
  try {
    // Set up data WITH context
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    await client.query("DELETE FROM udm_payments");
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    // Test 1: SET on client, query on same client (own read)
    const r1 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Same client, org_a read: cnt=' + r1.rows[0].cnt + ' (expected: 1)');
    
    // Test 2: Switch context on same client, query (cross-tenant read block)
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    const r2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Same client, org_b read: cnt=' + r2.rows[0].cnt + ' (expected: 0 - RLS blocked)');
    
    // Test 3: RESET on same client
    await client.query('RESET app.current_org_id');
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Same client, RESET read: cnt=' + r3.rows[0].cnt + ' (expected: 0 - fails closed)');
    
    // Test 4: Cross-tenant INSERT via same client
    try {
      await client.query('SET app.current_org_id = ' + "'test_org_b'");
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log('Cross-tenant INSERT (same client): ALLOWED (unexpected)');
    } catch (e) {
      console.log('Cross-tenant INSERT (same client): BLOCKED by RLS WITH CHECK');
    }
    
    // Test 5: Own INSERT via same client
    const ownInsert = await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own2', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('Own INSERT (same client): ALLOWED (id=' + ownInsert.rows[0].id + ')');
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

async function main() {
  await testDirectSession();
  await testPoolPattern();
  await testSameClientPattern();
}

main().catch(console.error);