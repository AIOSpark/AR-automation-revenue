const { Pool } = require("pg");
const pool = new Pool({connectionString: "postgresql://test_org_a:test_org_a_pwd@localhost:5432/aiospark_revenue"});

pool.query("SELECT tableowner FROM pg_tables WHERE tablename = 'udm_payments' AND schemaname = 'public'", (err, res) => {
  if (err) console.error(err);
  else console.log("Table owner:", res.rows[0].tableowner);
  pool.end();
});