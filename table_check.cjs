/**
 * Check table RLS settings.
 */

const { Pool } = require("pg");
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "",
  database: "aiospark_revenue",
});

async function main()  {
  const tables = ['udm_payments', 'udm_invoices'];
  for (const table of tables) {
    const tbl = await pool.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1", [table]);
    console.log(table + ": relrowsecurity=" + tbl.rows[0].relrowsecurity + " relforcerowsecurity=" + (tbl.rows[0].relforcerowsecurity || "null"));
  }
  
  // Also check if there's a difference in how policies are applied
  const pol1 = await pool.query("SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_payments'::regclass ORDER BY polcmd, polname");
  console.log("\nudm_payments policies:"); pol1.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
  });
  
  const pol2 = await pool.query("SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'udm_invoices'::regclass ORDER BY polcmd, polname");
  console.log("\nudm_invoices policies:"); pol2.rows.forEach(p => {
    const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
    console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
  });
  
  await pool.end();
}

main();