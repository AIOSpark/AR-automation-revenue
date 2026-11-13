import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://test_org_a:test_org_a_pwd@localhost:5432/aiospark_revenue'
});

async function main() {
  // Test INSERT with set_config on same client
  const client = await pool.connect();
  try {
    await client.query('SELECT set_config($1, $2, false)', ['app.current_org_id', 'org-A']);
    console.log('set_config executed');
    const insertResult = await client.query(
      "INSERT INTO udm_idempotency_keys(organization_id, key, record_id, status, owner_token, lease_generation, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (organization_id, key) DO NOTHING",
      ['org-B', 'cross-insert-test', 'res-ci', 'pending', null, 1, new Date(new Date().getTime() + 24 * 60 * 60 * 1000)]
    );
    console.log('Insert rowCount:', insertResult.rowCount);
    // Check if row exists
    const check = await client.query("SELECT count(*) as cnt FROM udm_idempotency_keys WHERE organization_id = 'org-B' AND key = 'cross-insert-test'");
    console.log('Row exists in org-B:', parseInt(check.rows[0].cnt));
  } finally {
    client.release();
  }
  
  // Now test org-A insert into org-B should be blocked
  const client2 = await pool.connect();
  try {
    await client2.query('SELECT set_config($1, $2, false)', ['app.current_org_id', 'org-A']);
    console.log('\\nOrg-A set_config executed');
    const insertResult2 = await client2.query(
      "INSERT INTO udm_idempotency_keys(organization_id, key, record_id, status, owner_token, lease_generation, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (organization_id, key) DO NOTHING",
      ['org-B', 'cross-insert-test-2', 'res-ci-2', 'pending', null, 1, new Date(new Date().getTime() + 24 * 60 * 60 * 1000)]
    );
    console.log('Org-A Insert rowCount:', insertResult2.rowCount);
    // Check if row exists
    const check2 = await client2.query("SELECT count(*) as cnt FROM udm_idempotency_keys WHERE organization_id = 'org-B' AND key = 'cross-insert-test-2'");
    console.log('Row exists in org-B after org-A set_config:', parseInt(check2.rows[0].cnt));
  } finally {
    client2.release();
  }
  
  await pool.end();
}

main();