/**
 * RLS debug v2 - test current_setting inside policy USING clause.
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
  console.log("=== RLS DEBUG V2 ===\n");
  
  // 1. Basic test table
  await pool.query("DROP TABLE IF EXISTS test_rls");
  await pool.query("CREATE TABLE test_rls (id text, org text, data text)");
  await pool.query("ALTER TABLE test_rls ENABLE ROW LEVEL SECURITY");
  
  // 2. Create policy with current_setting
  await pool.query("CREATE POLICY org_policy ON test_rls FOR ALL USING (org = current_setting('app.org_id', true))");
  
  // 3. Insert data
  await pool.query("INSERT INTO test_rls VALUES ('1', 'org_a', 'data_a')");
  await pool.query("INSERT INTO test_rls VALUES ('2', 'org_b', 'data_b')");
  
  // 4. Set context and test
  await pool.query("SET app.org_id = 'org_a'");
  
  // Test 1: Direct SELECT with the expression
  const r1 = await pool.query("SELECT id, org = current_setting('app.org_id', true) AS match FROM test_rls");
  console.log("Test 1 - SELECT id, org=current_setting():");
  r1.rows.forEach((r, i) => {
    console.log("  Row " + (i+1) + " (id=" + r.id + "): match=" + r.match);
  });
  
  // Test 2: SELECT *
  const r2 = await pool.query("SELECT * FROM test_rls");
  console.log("\nTest 2 - SELECT * rows: " + r2.rows.length);
  
  // 3. Switch context
  await pool.query("SET app.org_id = 'org_b'");
  
  // Test 3: SELECT * with org_b context
  const r3 = await pool.query("SELECT * FROM test_rls");
  console.log("\nTest 3 - SELECT * with org_b context: " + r3.rows.length + " rows");
  
  // 4. Test the raw current_setting
  const r4 = await pool.query("SELECT current_setting('app.org_id', true) AS val");
  console.log("\nTest 4 - current_setting value: " + r4.rows[0].val);
  
  console.log("\n=== END ===");
  
  await pool.end();
}

main();