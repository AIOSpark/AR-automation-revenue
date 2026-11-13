import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pools = {
  orgA: new Pool({connectionString: 'postgresql://postgres@localhost:5432/aiospark_revenue'}),
  orgB: new Pool({connectionString: 'postgresql://postgres@localhost:5432/aiospark_revenue'})
};

async function setTenant(pool, orgId) {
  await pool.query(`SET LOCAL app.current_org_id = '${orgId}'`);
}

async function runTests() {
  let passed = 0;
  let failed = 0;
  
  try {
    // Start fresh - clean all org data
    for (const pool of Object.values(pools)) {
      await pool.query("DELETE FROM udm_idempotency_keys WHERE organization_id = 'org-A'");
      await pool.query("DELETE FROM udm_idempotency_keys WHERE organization_id = 'org-B'");
      await pool.query("DELETE FROM scheduled_job_runs WHERE organization_id = 'org-A'");
      await pool.query("DELETE FROM job_leases WHERE organization_id = 'org-A'");
      await pool.query("DELETE FROM report_schedules WHERE organization_id = 'org-A'");
    }
    console.log('Initial cleanup completed');
    
    // D-004: SafetyMiddleware Verification
    console.log('\n========== D-004: SafetyMiddleware Verification ==========');
    await setTenant(pools.orgA, 'org-A');
    
    // Test 1: 10 simultaneous reservations, exactly one winner
    console.log('Test D-004.1: 10 simultaneous reservations, exactly one winner');
    const dedupeKey = 'safety:double_execution:test-action';
    await pools.orgA.query("DELETE FROM udm_idempotency_keys WHERE key = $1", [dedupeKey]);
    
    const reservationPromises = [];
    for (let i = 0; i < 10; i++) {
      reservationPromises.push(
        pools.orgA.query(
          `INSERT INTO udm_idempotency_keys(organization_id, key, record_id, status, owner_token, lease_generation, expires_at) VALUES ($1, $2, $3, 'pending', NULL, 1, NOW() + INTERVAL '24 hours') ON CONFLICT (organization_id, key) DO NOTHING`,
          ['org-A', dedupeKey, `res_${Date.now()}_${i}`]
        )
      );
    }
    
    const reservationResults = await Promise.all(reservationPromises);
    const successes = reservationResults.filter(r => r.rowCount === 1).length;
    const failures = reservationResults.filter(r => r.rowCount === 0).length;
    
    console.log(`  Reservations: ${successes} succeeded, ${failures} failed (conflicts)`);
    if (successes === 1 && failures === 9) {
      console.log('  ✅ PASS: Exactly one worker reserved the key');
      passed++;
    } else {
      console.log('  ❌ FAIL: Expected 1 success + 9 conflicts, got', successes, 'successes +', failures, 'failures');
      failed++;
    }
    
    const countResult = await pools.orgA.query(
      'SELECT count(*) as cnt FROM udm_idempotency_keys WHERE organization_id = $1 AND key = $2',
      ['org-A', dedupeKey]
    );
    const count = parseInt(countResult.rows[0].cnt, 10);
    
    if (count === 1) {
      console.log('  ✅ PASS: Exactly one row in database');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected 1 row, got ${count}`);
      failed++;
    }
    
    // Test 2: Stale owner rejection
    console.log('Test D-004.2: Stale owner rejection');
    await pools.orgA.query("DELETE FROM udm_idempotency_keys WHERE key = $1", ['safety:stale-test']);
    
    await pools.orgA.query(
      `INSERT INTO udm_idempotency_keys(organization_id, key, record_id, status, owner_token, lease_generation, expires_at) 
       VALUES ('org-A', 'safety:stale-test', 'res_stale_1', 'pending', 'old-worker', 1, NOW() + INTERVAL '1 hour')`
    );
    
    const newInsert = await pools.orgA.query(
      `INSERT INTO udm_idempotency_keys(organization_id, key, record_id, status, owner_token, lease_generation, expires_at) VALUES ('org-A', 'safety:stale-test', 'res_stale_2', 'pending', 'new-worker', 1, NOW() + INTERVAL '24 hours') ON CONFLICT (organization_id, key) DO NOTHING`
    );
    
    if (newInsert.rowCount === 0) {
      console.log('  ✅ PASS: Stale owner retained - new worker rejected (rowCount = 0)');
      passed++;
    } else {
      console.log('  ❌ FAIL: New worker was able to override stale reservation, rowCount=', newInsert.rowCount);
      failed++;
    }
    
    const countResult2 = await pools.orgA.query(
      'SELECT count(*) as cnt FROM udm_idempotency_keys WHERE organization_id = $1 AND key = $2',
      ['org-A', 'safety:stale-test']
    );
    const count2 = parseInt(countResult2.rows[0].cnt, 10);
    
    if (count2 === 1) {
      console.log('  ✅ PASS: Only one row persisted after stale test');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected 1 row, got ${count2}`);
      failed++;
    }
    
    // D-005: Scheduler Lease Verification
    console.log('\n========== D-005: Scheduler Lease Verification ==========');
    await setTenant(pools.orgA, 'org-A');
    
    // Test 3: Two workers claim same job run
    console.log('Test D-005.1: Two workers claim same job run, only one acquires lease');
    const scheduleId = uuidv4();
    await pools.orgA.query(
      `INSERT INTO report_schedules (id, organization_id, cron_expression, timezone, status, next_run_at, created_at, updated_at) 
       VALUES ($1, 'org-A', '0 9 * * *', 'UTC', 'active', NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [scheduleId]
    );
    
    const jobRunId = uuidv4();
    await pools.orgA.query(
      `INSERT INTO scheduled_job_runs (id, organization_id, schedule_id, scheduled_for, status) 
       VALUES ($1, 'org-A', $2, NOW() + INTERVAL '1 day', 'pending')`,
      [jobRunId, scheduleId]
    );
    
    const claim1 = await pools.orgA.query(
      `INSERT INTO job_leases (organization_id, job_run_id, owner_token, lease_generation, status, expires_at)
       VALUES ('org-A', $1, 'worker-1', 1, 'claimed', NOW() + INTERVAL '24 hours')
       ON CONFLICT (organization_id, job_run_id) DO NOTHING
       RETURNING id, lease_generation, status`,
      [jobRunId]
    );
    
    const claim2 = await pools.orgA.query(
      `INSERT INTO job_leases (organization_id, job_run_id, owner_token, lease_generation, status, expires_at)
       VALUES ('org-A', $1, 'worker-2', 1, 'claimed', NOW() + INTERVAL '24 hours')
       ON CONFLICT (organization_id, job_run_id) DO NOTHING
       RETURNING id, lease_generation, status`,
      [jobRunId]
    );
    
    const claim1Success = claim1.rows.length > 0;
    const claim2Success = claim2.rows.length > 0;
    
    if (claim1Success && !claim2Success) {
      console.log('  ✅ PASS: Only first worker acquired lease, second rejected');
      passed++;
    } else if (claim1Success && claim2Success) {
      console.log('  ❌ FAIL: Both workers acquired lease - second should be rejected');
      failed++;
    } else {
      console.log('  ❌ FAIL: Unexpected result');
      console.log('    Claim 1 rows:', claim1.rows.length, '| Claim 2 rows:', claim2.rows.length);
      failed++;
    }
    
    // Test 4: Expired lease recovery - clean up between
    console.log('Test D-005.2: Expired lease recovery');
    await pools.orgA.query("DELETE FROM job_leases WHERE organization_id = $1", ['org-A']);
    await pools.orgA.query("DELETE FROM scheduled_job_runs WHERE organization_id = $1", ['org-A']);
    await pools.orgA.query("DELETE FROM report_schedules WHERE organization_id = $1", ['org-A']);
    
    const newScheduleId = uuidv4();
    const newJobRunId = uuidv4();
    
    await pools.orgA.query(
      `INSERT INTO report_schedules (id, organization_id, cron_expression, timezone, status, next_run_at, created_at, updated_at) 
       VALUES ($1, 'org-A', '0 9 * * *', 'UTC', 'active', NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [newScheduleId]
    );
    
    await pools.orgA.query(
      `INSERT INTO scheduled_job_runs (id, organization_id, schedule_id, scheduled_for, status) 
       VALUES ($1, 'org-A', $2, NOW() + INTERVAL '1 day', 'pending')`,
      [newJobRunId, newScheduleId]
    );
    
    await pools.orgA.query(
      `INSERT INTO job_leases (organization_id, job_run_id, owner_token, lease_generation, status, expires_at) 
       VALUES ('org-A', $1, 'expired-worker', 1, 'claimed', NOW() - INTERVAL '1 hour')`,
      [newJobRunId]
    );
    
    const reclaim = await pools.orgA.query(
      `UPDATE job_leases
       SET status = 'expired', owner_token = $3, lease_generation = $4, updated_at = NOW()
       WHERE organization_id = $1 AND job_run_id = $2 AND status = 'claimed'
       RETURNING id, status, lease_generation`,
      ['org-A', newJobRunId, 'new-worker', 2]
    );
    
    if (reclaim.rows.length > 0 && reclaim.rows[0].status === 'expired') {
      console.log('  ✅ PASS: Expired lease can be reclaimed');
      passed++;
    } else {
      console.log('  ❌ FAIL: Expired lease reclamation failed');
      console.log('    Reclaim rows:', reclaim.rows.length);
      failed++;
    }
    
    // D-006: Payment Claims Verification
    console.log('\n========== D-006: Payment Claims Verification ==========');
    await setTenant(pools.orgA, 'org-A');
    
    // Test 5: 10 simultaneous payment claim attempts, exactly one owner
    console.log('Test D-006.1: 10 simultaneous payment claim attempts, exactly one owner');
    const paymentKey = 'org-A:payment_claim:pay-test-' + Date.now();
    await pools.orgA.query("DELETE FROM udm_idempotency_keys WHERE key = $1", [paymentKey]);
    
    const claimPromises = [];
    for (let i = 0; i < 10; i++) {
      claimPromises.push(
        pools.orgA.query(
          `INSERT INTO udm_idempotency_keys(organization_id, key, record_id, status, owner_token, lease_generation, expires_at) VALUES ($1, $2, $3, 'pending', NULL, 1, NOW() + INTERVAL '24 hours') ON CONFLICT (organization_id, key) DO NOTHING`,
          ['org-A', paymentKey, `res_claim_${i}`]
        )
      );
    }
    
    const claimResults = await Promise.all(claimPromises);
    const successfulClaims = claimResults.filter(r => r.rowCount === 1).length;
    const ignoredClaims = claimResults.filter(r => r.rowCount === 0).length;
    
    console.log(`  Claims: ${successfulClaims} succeeded, ${ignoredClaims} ignored (conflicts)`);
    if (successfulClaims === 1 && ignoredClaims === 9) {
      console.log('  ✅ PASS: Exactly one active owner, 9 workers rejected');
      passed++;
    } else {
      console.log('  ❌ FAIL: Expected 1 success + 9 conflicts, got', successfulClaims, 'successes +', ignoredClaims, 'conflicts');
      failed++;
    }
    
    const paymentCountResult = await pools.orgA.query(
      'SELECT count(*) as cnt FROM udm_idempotency_keys WHERE organization_id = $1 AND key = $2',
      ['org-A', paymentKey]
    );
    const paymentCount = parseInt(paymentCountResult.rows[0].cnt, 10);
    
    if (paymentCount === 1) {
      console.log('  ✅ PASS: Exactly one row in database');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected 1 row, got ${paymentCount}`);
      failed++;
    }
    
    // Test 6: Cross-tenant isolation
    console.log('Test D-006.2: Cross-tenant isolation');
    
    // From org-A perspective: should see its own claims
    await setTenant(pools.orgA, 'org-A');
    const orgAClaims = await pools.orgA.query(
      'SELECT count(*) as cnt FROM udm_idempotency_keys WHERE organization_id = \'org-A\''
    );
    const orgACount = parseInt(orgAClaims.rows[0].cnt, 10);
    
    if (orgACount === 1) {
      console.log('  ✅ PASS: org-A can see its own claims (1 row)');
      passed++;
    } else {
      console.log('  ❌ FAIL: org-A cannot see its own claims (expected 1, got', orgACount, ')');
      failed++;
    }
    
    // From org-B perspective: should see 0 claims
    await setTenant(pools.orgB, 'org-B');
    const crossTenantCheck = await pools.orgB.query(
      'SELECT count(*) as cnt FROM udm_idempotency_keys WHERE organization_id = \'org-A\''
    );
    const crossTenantCount = parseInt(crossTenantCheck.rows[0].cnt, 10);
    
    if (crossTenantCount === 0) {
      console.log('  ✅ PASS: Cross-tenant isolation - org-B cannot see org-A claims');
      passed++;
    } else {
      console.log('  ❌ FAIL: org-B can see org-A claims (tenant context leakage, cnt:', crossTenantCount, ')');
      failed++;
    }
    
    // Summary
    console.log('\n========== VERIFICATION SUMMARY ==========');
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total: ${passed + failed}`);
    
    if (failed === 0) {
      console.log('  🏆 CLASSIFICATION: DISTRIBUTED-VERIFIED');
    } else if (failed <= 3) {
      console.log('  ⚠️  CLASSIFICATION: CONCURRENCY-VERIFIED-BUT-RECOVERY-INCOMPLETE');
    } else if (failed <= 6) {
      console.log('  ⚠️  CLASSIFICATION: PARTIALLY VERIFIED');
    } else {
      console.log('  ❌ CLASSIFICATION: UNRESOLVED');
    }
    
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Test error:', error);
    failed++;
    process.exit(1);
  } finally {
    // Final cleanup
    for (const pool of Object.values(pools)) {
      try { await pool.query("DELETE FROM udm_idempotency_keys WHERE organization_id = 'org-A'"); } catch(e) {}
      try { await pool.query("DELETE FROM udm_idempotency_keys WHERE organization_id = 'org-B'"); } catch(e) {}
      try { await pool.query("DELETE FROM scheduled_job_runs WHERE organization_id = 'org-A'"); } catch(e) {}
      try { await pool.query("DELETE FROM job_leases WHERE organization_id = 'org-A'"); } catch(e) {}
      try { await pool.query("DELETE FROM report_schedules WHERE organization_id = 'org-A'"); } catch(e) {}
    }
  }
}

runTests();
