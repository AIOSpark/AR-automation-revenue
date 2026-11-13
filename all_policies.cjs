/**
 * Check RLS policies on all payment-domain tables.
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
  const tables = [
    'udm_payments', 'udm_invoices', 'udm_payment_allocations',
    'udm_payment_refunds', 'udm_payment_reversals', 'udm_ar_reconciliation'
  ];
  
  for (const table of tables) {
    const pol = await pool.query("SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polcmd, polname", [table]);
    console.log(table + ":"); pol.rows.forEach(p => {
      const cmdMap = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };
      console.log("  " + cmdMap[p.polcmd] + ": " + p.polname + " qual=" + (p.polqual ? "yes" : "no") + " wcheck=" + (p.polwithcheck ? "yes" : "no"));
    });
  }
  
  await pool.end();
}

main();