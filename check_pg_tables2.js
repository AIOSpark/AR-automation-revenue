const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'test_org_a',
  password: 'test_org_a_pwd',
  database: 'aiospark_revenue',
});

pool.query(
  "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' ORDER BY table_schema, table_name",
  (err, res) => {
    if (err) console.error('Error:', err);
    else {
      console.log('All tables (' + res.rows.length + '):');
      res.rows.forEach(r => {
        console.log('  schema=' + r.table_schema + '. table=' + r.table_name);
      });
    }
    pool.end();
  }
);