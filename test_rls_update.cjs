/** 
 * RLS test for UPDATE with same-client pattern
 */
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ 
    host: 'localhost', 
    port: 5432, 
    user: 'test_org_a', 
    password: 'test_org_a_pwd', 
    database: 'aiospark_revenue' 
  });
  
  const client = await pool.connect();
  
  try {
    // Clean start - delete all payments
    await client.query("DELETE FROM udm_payments");
    
    // Insert test data with unique IDs
    const suffix = Date.now() % 10000;
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a_" + suffix + "', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    console.log('=== UPDATE TESTS (same client pattern) ===\n');
    
    // 1. UPDATE own payment with own context
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    try {
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
      const r1 = await client.query("SELECT status FROM udm_payments WHERE id = 'pay_a_" + suffix + "'");
      console.log('UPDATE own payment (org_a context): ALLOWED, status=' + r1.rows[0].status);
    } catch (e) {
      console.log('UPDATE own payment (org_a context): BLOCKED - ' + e.message.substring(0, 50));
    }
    
    // 2. UPDATE own payment with other org context (should be blocked)
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    try {
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
      console.log('UPDATE own payment (org_b context): ALLOWED (unexpected - should be blocked)');
    } catch (e) {
      console.log('UPDATE own payment (org_b context): BLOCKED by RLS (expected)');
    }
    
    // 3. Switch back to own context and UPDATE
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    try {
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
      const r3 = await client.query("SELECT status FROM udm_payments WHERE id = 'pay_a_" + suffix + "'");
      console.log('UPDATE own payment (org_a context after switch): ALLOWED, status=' + r3.rows[0].status);
    } catch (e) {
      console.log('UPDATE own payment (org_a context after switch): BLOCKED - ' + e.message.substring(0, 50));
    }
    
    // 4. Test cross-tenant UPDATE (org_b tries to UPDATE org_a's payment)
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    try {
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
      console.log('Cross-tenant UPDATE (org_b UPDATE org_a payment): ALLOWED (unexpected)');
    } catch (e) {
      console.log('Cross-tenant UPDATE (org_b UPDATE org_a payment): BLOCKED by RLS (expected)');
    }
    
    // 5. Test missing context fails closed for UPDATE
    await client.query('RESET app.current_org_id');
    try {
      await client.query("UPDATE udm_payments SET status = 'reversed' WHERE id = 'pay_a_" + suffix + "'");
      console.log('UPDATE with missing context: ALLOWED (unexpected - should fail closed)');
    } catch (e) {
      console.log('UPDATE with missing context: BLOCKED by RLS (expected - fails closed)');
    }
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main().catch(console.error);