/** 
 * Check if SET persists across pool.query() calls
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
  
  // Set up data
  await pool.query("DELETE FROM udm_payments");
  const suffix = Date.now() % 10000;
  
  // Insert payment for org_a
  await pool.query('SET app.current_org_id = ' + "'test_org_a'");
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a_" + suffix + "', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  console.log('Inserted pay_a with org_a context');
  
  // Now try to read without re-SETting
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('Read without re-SET: cnt=' + r1.rows[0].cnt);
  
  // Try with explicit SET before read
  await pool.query('SET app.current_org_id = ' + "'test_org_a'");
  const r2 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
  console.log('Read with SET before: cnt=' + r2.rows[0].cnt);
  
  // Check current_setting directly
  const cs = await pool.query("SELECT current_setting('app.current_org_id', true)");
  console.log('current_setting value:', cs.rows[0].current_setting);
  
  await pool.end();
}

main().catch(console.error);