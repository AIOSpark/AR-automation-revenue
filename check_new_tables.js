const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'test_org_a',
  password: 'test_org_a_pwd',
  database: 'aiospark_revenue',
});

pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  (err, res) => {
    if (err) console.error('Error:', err);
    else {
      console.log('User tables in public schema:');
      res.rows.forEach(r => {
        console.log(' - ' + r.table_name);
      });
      
      // Check for new payment domain tables
      const newTables = ['udm_payment_allocations', 'udm_payment_refunds', 'udm_payment_reversals', 'udm_ar_reconciliation', 'udm_payments'];
      console.log('\nNew payment domain tables status:');
      newTables.forEach(t => {
        const exists = res.rows.some(r => r.table_name === t);
        console.log('  ' + t + ': ' + (exists ? '✅ EXISTS' : '❌ MISSING'));
      });
    }
    pool.end();
  }
);