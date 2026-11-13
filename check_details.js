const { Pool } = require("pg");
const pool = new Pool({connectionString: "postgresql://test_org_a:test_org_a_pwd@localhost:5432/aiospark_revenue"});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

async function main() {
  try {
    // Check organization_id columns on payment tables
    const tables = ["udm_payments", "udm_invoices", "udm_payment_allocations", "udm_payment_refunds", "udm_payment_reversals", "udm_ar_reconciliation"];
    for (const t of tables) {
      const colResult = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [t]);
      console.log(t + " columns:", colResult.rows.map(r => r.column_name + "(" + r.data_type + ")").join(", "));
    }
    
    // Check org_isolation policy details more carefully
    console.log("\n--- org_isolation_select on udm_idempotency_keys ---");
    const polResult = await query("SELECT polname, polcmd, polqual, polwithcheck, polroles FROM pg_policy WHERE polname = 'org_isolation_select'");
    if (polResult.rows.length > 0) {
      const p = polResult.rows[0];
      console.log("polcmd:", p.polcmd);
      console.log("polqual:", p.polqual ? "present" : "null");
      console.log("polwithcheck:", p.polwithcheck ? "present" : "null");
      console.log("polroles:", p.polroles);
    }
    
    // Check if BYPASSRLS role exists
    console.log("\n--- Checking roles ---");
    const roleResult = await query("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('test_org_a', 'test_org_b', 'app', 'web_anon')");
    roleResult.rows.forEach(r => console.log("Role:", r.rolname, "super=", r.rolsuper, "bypass_rls=", r.rolbypassrls));
    
    // Check current_setting behavior
    console.log("\n--- Testing SET app.current_org_id ---");
    await query("SET app.current_org_id = 'test_org_a'");
    const cfgResult = await query("SHOW app.current_org_id");
    console.log("After SET:", cfgResult.rows[0].show);
    
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

main();