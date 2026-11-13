/**
 * Check policy definitions.
 */

const { Pool } = require("pg");
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "test_org_a",
  password: "test_org_a_pwd",
  database: "aiospark_revenue",
});

async function main() {
  const pol = await pool.query("SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname");
  console.log("Policies:"); pol.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
  });
  await pool.end();
}

main();