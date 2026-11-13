const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'test_org_a',
  password: 'test_org_a_pwd',
  database: 'aiospark_revenue',
});

pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  (err, res) => {
    if (err) console.error('Error:', err);
    else {
      console.log('Tables:', res.rows.map(r => r.table_name));
    }
    pool.end();
  }
);