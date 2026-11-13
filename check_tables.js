const { Pool } = require("pg");
const pool = new Pool({connectionString: "postgresql://test_org_a:test_org_a_pwd@localhost:5432/aiospark_revenue"});

pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename", (err, res) => {
  if (err) console.error(err);
  else {
    console.log("Tables:", res.rows.map(r => r.tablename).slice(0, 30));
    console.log("... total:", res.rows.length);
    
    // Check RLS on each payment domain table
    const paymentTables = ["udm_payments", "udm_invoices", "udm_payment_allocations", "udm_payment_refunds", "udm_payment_reversals", "udm_ar_reconciliation", "udm_idempotency_keys"];
    
    function checkTable(t, idx) {
      if (idx >= paymentTables.length) {
        pool.end();
        return;
      }
      const tname = paymentTables[idx];
      pool.query("SELECT polname, polcmd, polroles FROM pg_policy WHERE polrelid = $1::regclass", [tname], (err2, res2) => {
        if (err2) console.error("Error on", tname, err2);
        else {
          const policies = res2.rows.filter(r => r.polname);
          console.log(tname + ":", policies.length > 0 ? "Policies: " + policies.map(p => p.polname + " " + p.polcmd + (p.polroles && p.polroles.length > 0 ? " roles:" + p.polroles.length : "")).join(", ") : "NO POLICIES");
        }
        checkTable(tname, idx + 1);
      });
    }
    
    checkTable(paymentTables[0], 0);
  }
});