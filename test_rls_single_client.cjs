/** 
 * RLS test using a single client for all operations
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
    // Clean start - delete ALL rows and reset sequence
    await client.query("DELETE FROM udm_payments");
    
    // 1. SET context first
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    console.log('Set org context to test_org_a');
    
    // 2. Insert payment for org_a
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a_" + Date.now() + "', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    console.log('INSERT pay_a (org_a, org_a context): SUCCESS');
    
    // 3. Insert payment for org_b (with org_a context - should be blocked)
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b_cross_" + Date.now() + "', 'test_org_b', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log('INSERT pay_b_cross (org_b, org_a context): ALLOWED (unexpected)');
    } catch (e) {
      console.log('INSERT pay_b_cross (org_b, org_a context): BLOCKED by RLS');
    }
    
    // 4. Verify data
    const countAll = await client.query("SELECT COUNT(*) as cnt FROM udm_payments");
    console.log('Total payments after inserts: ' + countAll.rows[0].cnt);
    
    // 5. Read own payments
    const r1 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Read own payments (org_a context): cnt=' + r1.rows[0].cnt);
    
    // 6. Switch context and read cross-tenant
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    const r2 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Read org_a payments (org_b context): cnt=' + r2.rows[0].cnt + ' (expected: 0 - RLS blocked)');
    
    // 7. Switch back and read own
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Read own payments after switch back: cnt=' + r3.rows[0].cnt + ' (expected: 1)');
    
    // 8. Test missing context fails closed
    await client.query('RESET app.current_org_id');
    const r4 = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Read own payments (missing context): cnt=' + r4.rows[0].cnt + ' (expected: 0 - fails closed)');
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main().catch(console.error);