/**
 * Test INSERT on various tables with RLS.
 */

const { Pool } = require("pg");
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "",
  database: "aiospark_revenue",
});

async function main() {
  console.log("=== INSERT ON OTHER TABLES ===\n");
  
  // Clean state
  for (const table of [
    'udm_payments', 'udm_invoices', 'udm_payment_allocations',
    'udm_payment_refunds', 'udm_payment_reversals', 'udm_ar_reconciliation'
  ]) {
    await pool.query("DELETE FROM " + table + " WHERE organization_id IN ('test_org_a', 'test_org_b')");
  }
  
  // Use client for all ops
  const client = await pool.connect();
  
  try {
    // Insert test data into payments
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    await client.query(
      "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
    );
    
    // Test 1: INSERT cross-tenant payment with org_b context
    total++;
    await client.query("SET app.current_org_id = 'test_org_b'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_cross', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log("Test 1 - INSERT cross-tenant payment: ALLOWED (unexpected)");
    } catch (e) {
      console.log("Test 1 - INSERT cross-tenant payment: BLOCKED by RLS");
    }
    
    // Test 2: INSERT own payment with org_a context
    await client.query("SET app.current_org_id = 'test_org_a'");
    try {
      await client.query(
        "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_own', 'test_org_a', 'cust_c', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
      );
      console.log("Test 2 - INSERT own payment with org_a: ALLOWED (expected)");
    } catch (e) {
      console.log("Test 2 - INSERT own payment with org_a: BLOCKED - " + e.message.substring(0, 30));
    }
    
    // Test 3: INSERT into udm_invoices with cross-tenant
    await client.query("SET app.current_org_id = 'test_org_b'");
    try {
      await client.query(
        "INSERT INTO udm_invoices (id, payment_id, organization_id, amount_minor_units, currency, date, status) VALUES ('inv_cross', 'pay_a', 'test_org_a', 500, 'INR', NOW(), 'open')"
      );
      const r3 = await client.query("SELECT COUNT(*) as cnt FROM udm_invoices WHERE id = 'inv_cross'");
      console.log("Test 3 - INSERT cross-tenant invoice: ALLOWED, cnt=" + r3.rows[0].cnt);
    } catch (e) {
      console.log("Test 3 - INSERT cross-tenant invoice: BLOCKED by RLS");
    }
    
    // Test 4: INSERT into udm_payment_allocations with cross-tenant
    try {
      await client.query(
        "INSERT INTO udm_payment_allocations (id, payment_id, organization_id, amount_minor_units, currency, date, allocation_type) VALUES ('alloc_cross', 'pay_a', 'test_org_a', 500, 'INR', NOW(), 'manual')"
      );
      const r4 = await client.query("SELECT COUNT(*) as cnt FROM udm_payment_allocations WHERE id = 'alloc_cross'");
      console.log("Test 4 - INSERT cross-tenant allocation: ALLOWED, cnt=" + r4.rows[0].cnt);
    } catch (e) {
      console.log("Test 4 - INSERT cross-tenant allocation: BLOCKED by RLS");
    }
    
  } finally {
    client.release();
  }
  
  await pool.end();
}

main();