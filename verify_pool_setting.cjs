/**
 * Verify that SET persists across pool.query() calls.
 * This is the key issue: Node.js pg pool does NOT persist session settings
 * across client acquisitions.
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
  console.log("=== POOL SET PERSISTENCE TEST ===\n");
  
  // Clean state
  await pool.query("DELETE FROM udm_payments WHERE organization_id IN ('test_org_a', 'test_org_b')");
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_a', 'test_org_a', 'cust_a', 'manual', 'manual', 1000, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  await pool.query(
    "INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, payment_type, payment_method, payment_source, status) VALUES ('pay_b', 'test_org_b', 'cust_b', 'manual', 'manual', 500, 'INR', NOW(), 'ar_customer', 'manual', 'manual_upload', 'captured')"
  );
  
  let passed = 0;
  let total = 0;
  
  // Test 1: SET via pool.query(), then SELECT via pool.query() - may not persist
  total++;
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const r1 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments");
  console.log("Test 1 - SET via pool.query, SELECT via pool.query: cnt=" + r1.rows[0].cnt + " (may not persist)");
  
  // Test 2: SET via same client, then SELECT via same client
  total++;
  const client1 = await pool.connect();
  try {
    await client1.query("SET app.current_org_id = 'test_org_a'");
    const r2a = await client1.query("SELECT COUNT(*) as cnt FROM udm_payments");
    console.log("Test 2a - SET via client1, SELECT via client1: cnt=" + r2a.rows[0].cnt);
    
    // Now switch context on same client
    await client1.query("SET app.current_org_id = 'test_org_b'");
    const r2b = await client1.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("Test 2b - After switch, counting org_a: cnt=" + r2b.rows[0].cnt);
  } finally {
    client1.release();
  }
  
  // Test 3: SET via pool.connect() (same client for both operations)
  total++;
  const client3 = await pool.connect();
  try {
    await client3.query("SET app.current_org_id = 'test_org_a'");
    const r3 = await client3.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("Test 3 - Same client for SET and SELECT: cnt=" + r3.rows[0].cnt);
  } finally {
    client3.release();
  }
  
  // Test 4: SET via pool.connect(), then SELECT via pool.query() (different clients)
  total++;
  const client4 = await pool.connect();
  try {
    await client4.query("SET app.current_org_id = 'test_org_a'");
    const r4 = await pool.query("SELECT COUNT(*) as cnt FROM udm_payments WHERE organization_id = 'test_org_a'");
    console.log("Test 4 - SET via client4, SELECT via pool.query: cnt=" + r4.rows[0].cnt + " (likely won't persist)");
  } finally {
    client4.release();
  }
  
  console.log("\n" + passed + "/" + total + " tests completed");
  
  await pool.end();
}

main();