/** 
 * Check the actual policy expression evaluation - no INSERT
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
    // Clean start - delete ALL rows
    await client.query("DELETE FROM udm_payments");
    
    // Set context first
    await client.query('SET app.current_org_id = ' + "'test_org_a'");
    
    // Insert test data - use random suffix to avoid conflicts
    const suffix = Date.now() % 10000;
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a_" + suffix + "', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b_" + suffix + "', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    console.log('Test data inserted');
    
    // Now test the expression evaluation
    console.log('\n=== Policy Expression Evaluation ===');
    
    // What does current_setting return?
    const cs = await client.query("SELECT current_setting('app.current_org_id', true)");
    console.log('current_setting value:', cs.rows[0].current_setting);
    
    // What does NULLIF return?
    const n = await client.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS nilf");
    console.log('NULLIF result:', n.rows[0].nilf);
    
    // The full expression
    const expr = await client.query("SELECT id, organization_id = NULLIF(current_setting('app.current_org_id', true), '') AS eval FROM udm_payments");
    console.log('Full expression results:');
    expr.rows.forEach(r => {
      console.log('  id=' + r.id + ' org=' + r.organization_id + ' eval=' + String(r.eval));
    });
    
    // Test SELECT with the WHERE clause
    const sel = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = NULLIF(current_setting('app.current_org_id', true), '')");
    console.log('SELECT WHERE eval: cnt=' + sel.rows[0].cnt);
    
    // Test cross-tenant SELECT
    await client.query('SET app.current_org_id = ' + "'test_org_b'");
    const crossSel = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('Cross-tenant SELECT (org_b context): cnt=' + crossSel.rows[0].cnt + ' (expected: 0)');
    
    // Reset and test
    await client.query('RESET app.current_org_id');
    const resetSel = await client.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log('After RESET SELECT: cnt=' + resetSel.rows[0].cnt + ' (expected: 0 - fails closed)');
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main().catch(console.error);