const { Pool } = require('pg');
const pool = new Pool({connectionString: 'postgresql://test_org_a:test_org_a_pwd@localhost:5432/aiospark_revenue'});

pool.query("SELECT * FROM pg_policy WHERE polrelid = 'udm_idempotency_keys'::regclass", [], (err, res) => {
  if (err) console.error(err);
  else console.log(JSON.stringify(res.rows));
  pool.end();
});