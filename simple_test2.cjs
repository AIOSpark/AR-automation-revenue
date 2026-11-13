/**
 * Verify allocation works with invoice creation
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'test_org_a',
  password: 'test_org_a_pwd',
  database: 'aiospark_revenue',
});

async function query(sql) {
  const client = await pool.connect();
  try {
    await client.query(`SET app.current_org_id = 'test_org_a'`);
    const result = await client.query(sql);
    return result;
  } finally {
    client.release();
  }
}

async function main() {
  // Create invoice first, then allocate
  await query(
    "INSERT INTO udm_invoices (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, status, issue_date, due_date) VALUES ('inv_test', 'test_org_a', 'cust_test', 'manual', 'manual_1', 2000, 'INR', 'open', NOW(), DATE '2027-12-13')"
  );
  
  await query(
    "INSERT INTO udm_payment_allocations (id, organization_id, payment_id, invoice_id, allocated_amount_minor_units, status, allocation_timestamp, actor, reversal_reference) VALUES ('alloc_test', 'test_org_a', 'pay_test', 'inv_test', 1000, 'allocated', NOW(), 'test_user', NULL)"
  );
  
  const allocResult = await query("SELECT allocated_amount_minor_units FROM udm_payment_allocations WHERE id = 'alloc_test' AND status = 'allocated'");
  
  if (allocResult.rows.length > 0 && allocResult.rows[0].allocated_amount_minor_units === 1000) {
    console.log('✅ Payment allocation works correctly with invoice: 1000 allocated');
  } else {
    console.log('❌ Allocation failed: got', allocResult.rows);
  }
  
  // Also test allocation across multiple invoices
  await query(
    "INSERT INTO udm_invoices (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, status, issue_date, due_date) VALUES ('inv_test2', 'test_org_a', 'cust_test', 'manual', 'manual_2', 1500, 'INR', 'open', NOW(), DATE '2027-12-13')"
  );
  
  await query(
    "INSERT INTO udm_payment_allocations (id, organization_id, payment_id, invoice_id, allocated_amount_minor_units, status, allocation_timestamp, actor, reversal_reference) VALUES ('alloc_test2_a', 'test_org_a', 'pay_test', 'inv_test2', 1000, 'allocated', NOW(), 'test_user', NULL)"
  );
  await query(
    "INSERT INTO udm_payment_allocations (id, organization_id, payment_id, invoice_id, allocated_amount_minor_units, status, allocation_timestamp, actor, reversal_reference) VALUES ('alloc_test2_b', 'test_org_a', 'pay_test', 'inv_test2', 500, 'allocated', NOW(), 'test_user', NULL)"
  );
  
  const totalResult = await query("SELECT SUM(allocated_amount_minor_units) as total FROM udm_payment_allocations WHERE payment_id = 'pay_test' AND status = 'allocated'");
  const total = parseInt(totalResult.rows[0].total);
  
  if (total === 1500) {
    console.log('✅ One payment across multiple invoices: total allocated = 1500 (1000 + 500)');
  } else {
    console.log('❌ Multi-invoice total: expected 1500, got', total);
  }
}

main();