const { Pool } = require('pg');
const pool = new Pool({connectionString: 'postgresql://test_org_a:test_org_a_pwd@localhost:5432/aiospark_revenue'});

const tables = ['udm_idempotency_keys', 'job_leases', 'scheduled_job_runs', 'report_schedules', 'job_execution_attempts'];

async function checkAll() {
  for (const t of tables) {
    try {
      const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position`);
      console.log(`${t}:`, JSON.stringify(res.rows));
    } catch(e) {
      console.log(`${t}: error - ${e.message}`);
    }
  }
  pool.end();
}

checkAll();