/** 
 * Debug RLS INSERT issue
 */
const { Pool } = require('pg');

async function main() {
  // Test 1: Default pool max, same client
  console.log('=== TEST 1: Default pool max, same client ===\n');
  const pool1 = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  const client1 = await pool1.connect();
  try {
    await client1.query("DELETE FROM udm_payments");
    await client1.query('SET app.current_org_id = ' + "'test_org_a'");
    
    // Check current_setting before INSERT
    const csBefore = await client1.query("SELECT current_setting('app.current_org_id', true)");
    console.log('Before INSERT - current_setting:', csBefore.rows[0].current_setting);
    
    await client1.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_test_1', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('INSERT succeeded');
    
    const count = await client1.query("SELECT COUNT(*) as cnt FROM udm_payments");
    console.log('Count after INSERT:', count.rows[0].cnt);
  } finally {
    client1.release();
  }
  await pool1.end();
  
  // Test 2: max:1 pool, same client
  console.log('\n=== TEST 2: max:1 pool, same client ===\n');
  const pool2 = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue',
    max: 1 
  });
  
  const client2 = await pool2.connect();
  try {
    await client2.query("DELETE FROM udm_payments");
    await client2.query('SET app.current_org_id = ' + "'test_org_a'");
    
    // Check current_setting before INSERT
    const csBefore2 = await client2.query("SELECT current_setting('app.current_org_id', true)");
    console.log('Before INSERT - current_setting:', csBefore2.rows[0].current_setting);
    
    try {
      await client2.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_test_2', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log('INSERT succeeded');
    } catch (e) {
      console.log('INSERT failed:', e.message.substring(0, 60));
    }
    
    const count2 = await client2.query("SELECT COUNT(*) as cnt FROM udm_payments");
    console.log('Count after INSERT:', count2.rows[0].cnt);
  } finally {
    client2.release();
  }
  await pool2.end();
  
  // Test 3: Check if INSERT works at all with test_org_a
  console.log('\n=== TEST 3: Basic INSERT test ===\n');
  const pool3 = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  const client3 = await pool3.connect();
  try {
    await client3.query("DELETE FROM udm_payments");
    await client3.query('SET app.current_org_id = ' + "'test_org_a'");
    
    const insertResult = await client3.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_direct', 'test_org_a', 'cust_d', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('Direct INSERT succeeded, id=' + insertResult.rows[0].id);
    
    const count3 = await client3.query("SELECT COUNT(*) as cnt FROM udm_payments");
    console.log('Count:', count3.rows[0].cnt);
  } finally {
    client3.release();
  }
  await pool3.end();
}

main().catch(console.error);