const { Pool } = require("pg");
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "test_org_a",
  password: "test_org_a_pwd",
  database: "aiospark_revenue",
});

async function main() {
  // Set the org context
  await pool.query("SET app.current_org_id = 'test_org_b'");
  
  // Check what current_setting returns
  const result = await pool.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS org_val");
  console.log("current_setting value:", result.rows[0].org_val);
  
  // Also check with test_org_a
  await pool.query("SET app.current_org_id = 'test_org_a'");
  const result2 = await pool.query("SELECT NULLIF(current_setting('app.current_org_id', true), '') AS org_val");
  console.log("current_setting value (test_org_a):", result2.rows[0].org_val);
  
  await pool.end();
}

main();