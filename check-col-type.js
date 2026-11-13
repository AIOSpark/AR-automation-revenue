const { Pool } = require('pg');
const pool = new Pool({connectionString: 'postgresql://test_org_a:test_org_a_pwd@localhost:5432/aiospark_revenue'});

pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'udm_idempotency_keys' ORDER BY ordinal_position", [], (err, res) => {
  if (err) console.error(err);
  else console.log('Column types:', JSON.stringify(res.rows));
  pool.end();
});