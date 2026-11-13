// AIOSpark PostgreSQL Repository for Report Schedules (Layer 23-24)
// Authoritative durable store replacing the in-memory ReportSchedulerStore Map.
// All operations are tenant-scoped via organization_id and RLS policies.

import { pool, query, queryOne } from './postgres';
import { ExportFormat } from '../reports/export-service';
import { ReportScheduleRecord } from '../reports/scheduler';

/** Map a database row to the ReportScheduleRecord interface. */
function mapDbRow(row: any): ReportScheduleRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    report_id: row.report_id,
    params: row.params || {},
    format: row.format,
    recipients: row.recipients || [],
    cadence: row.cadence as 'daily' | 'weekly' | 'monthly',
    created_by_user_id: row.created_by_user_id,
    last_run_at: row.last_run_at,
    next_run_at: row.next_run_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status as 'active' | 'paused' | 'disabled',
    run_count: row.run_count,
    max_runs: row.max_runs,
  };
}

/** ============================================================================
 *  SCHEDULE (report_schedules) — from B3
 * ========================================================================== */

export async function createSchedule(input: {
  organization_id: string;
  report_id: string;
  params?: Record<string, any>;
  format: ExportFormat;
  recipients: string[];
  cadence: 'daily' | 'weekly' | 'monthly';
  created_by_user_id: string;
}): Promise<ReportScheduleRecord> {
  const id = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const nextRun = new Date(Date.now() + 86400000).toISOString();

  const { rows } = await pool.query(
    `INSERT INTO report_schedules (
      id, organization_id, report_id, params, format, recipients,
      cadence, created_by_user_id, last_run_at, next_run_at, created_at, updated_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
    RETURNING *`,
    [
      id, input.organization_id, input.report_id, input.params, input.format,
      input.recipients, input.cadence, input.created_by_user_id,
      null, nextRun, now, now,
    ]
  );

  return mapDbRow(rows[0]);
}

export async function getSchedule(id: string, orgId: string): Promise<ReportScheduleRecord | null> {
  const { rows } = await pool.query(
    'SELECT * FROM report_schedules WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (rows.length === 0) return null;
  return mapDbRow(rows[0]);
}

export async function getSchedules(orgId: string): Promise<ReportScheduleRecord[]> {
  const { rows } = await pool.query(
    'SELECT * FROM report_schedules WHERE organization_id = $1 ORDER BY created_at DESC',
    [orgId]
  );
  return rows.map(mapDbRow);
}

export async function updateSchedule(id: string, orgId: string, updates: {
  status?: 'active' | 'paused' | 'disabled';
  next_run_at?: string;
  run_count?: number;
  max_runs?: number | null;
}): Promise<ReportScheduleRecord> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`);
    values.push(updates.status);
  }
  if (updates.next_run_at !== undefined) {
    setClauses.push(`next_run_at = $${paramIdx++}`);
    values.push(updates.next_run_at);
  }
  if (updates.run_count !== undefined) {
    setClauses.push(`run_count = $${paramIdx++}`);
    values.push(updates.run_count);
  }
  if (updates.max_runs !== undefined) {
    setClauses.push(`max_runs = $${paramIdx++}`);
    values.push(updates.max_runs);
  }
  setClauses.push(`updated_at = NOW()`);
  values.push(id);
  values.push(orgId);

  const sql = `
    UPDATE report_schedules
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIdx - 1} AND organization_id = $${paramIdx - 2}
    RETURNING *`;
  const { rows } = await pool.query(sql, values);
  if (rows.length === 0) throw new Error(`Schedule not found or access denied: ${id}`);
  return mapDbRow(rows[0]);
}

export async function getEligibleSchedules(orgId: string): Promise<ReportScheduleRecord[]> {
  const { rows } = await pool.query(
    `SELECT * FROM report_schedules
     WHERE organization_id = $1 AND status = 'active' AND next_run_at <= NOW()
     ORDER BY next_run_at ASC`,
    [orgId]
  );
  return rows.map(mapDbRow);
}

export async function markScheduleRun(
  id: string, orgId: string, nextRunAt: string
): Promise<ReportScheduleRecord> {
  const { rows } = await pool.query(
    `UPDATE report_schedules
     SET run_count = run_count + 1,
         last_run_at = NOW(),
         next_run_at = $3,
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [id, orgId, nextRunAt]
  );
  if (rows.length === 0) throw new Error(`Schedule not found or access denied: ${id}`);
  return mapDbRow(rows[0]);
}

export async function disableSchedule(id: string, orgId: string): Promise<ReportScheduleRecord> {
  return updateSchedule(id, orgId, { status: 'disabled' });
}

/** ============================================================================
 *  SCHEDULED JOB RUNS (scheduled_job_runs) — B4
 *  Individual execution occurrences, separated from schedule definitions.
 * ========================================================================== */

/** Create a new job run occurrence for a schedule.
 *  Called by the job runner to generate an eligible occurrence.
 *  Uses INSERT ... ON CONFLICT DO NOTHING to prevent duplicates.
 */
export async function createJobRun(
  orgId: string,
  scheduleId: string,
  scheduledFor: Date
): Promise<{ jobRunId: string; alreadyExists: boolean }> {
  const id = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const { rows } = await pool.query(
    `INSERT INTO scheduled_job_runs (
      id, organization_id, schedule_id, scheduled_for, status
    ) VALUES ($1, $2, $3, $4, 'pending')
    ON CONFLICT (organization_id, id) DO NOTHING
    RETURNING *`,
    [id, orgId, scheduleId, scheduledFor.toISOString()]
  );

  if (rows.length > 0) {
    return { jobRunId: rows[0].id, alreadyExists: false };
  }
  // Conflict — another occurrence already exists for this schedule/org at this time
  // Try to find the existing one
  const { rows: existing } = await pool.query(
    'SELECT id FROM scheduled_job_runs WHERE organization_id = $1 AND schedule_id = $2 AND scheduled_for = $3',
    [orgId, scheduleId, scheduledFor.toISOString()]
  );
  return { jobRunId: existing[0].id, alreadyExists: true };
}

/** Get all pending/claimed job runs for an organization that are available now. */
export async function getEligibleJobRuns(orgId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT sjr.*, s.cadence, s.next_run_at, s.run_count, s.max_runs
     FROM scheduled_job_runs sjr
     JOIN report_schedules s ON sjr.schedule_id = s.id AND sjr.organization_id = s.organization_id
     WHERE sjr.organization_id = $1
       AND sjr.status IN ('pending', 'claimed')
       AND sjr.scheduled_for <= NOW()
     ORDER BY sjr.scheduled_for ASC
     LIMIT 100`,
    [orgId]
  );
  return rows;
}

/** Claim a job run for execution.
 *  Atomic: only one worker can claim each job run.
 *  Uses INSERT ... ON CONFLICT DO UPDATE with lease generation.
 *  Returns the claim result and whether this worker now owns the lease.
 */
export async function claimJobRun(
  orgId: string,
  jobRunId: string,
  ownerToken: string,
  leaseGeneration: number
): Promise<{
  claimStatus: 'acquired' | 'conflict' | 'expired' | 'not_found' | 'terminal';
  leaseId: string | null;
  jobRun: any;
}> {
  // First, verify the job run exists and belongs to this org
  const { rows: jobRows } = await pool.query(
    'SELECT * FROM scheduled_job_runs WHERE id = $1 AND organization_id = $2',
    [jobRunId, orgId]
  );
  if (jobRows.length === 0) {
    return { claimStatus: 'not_found', leaseId: null, jobRun: null };
  }

  const jobRun = jobRows[0];

  // Skip if already completed or exhausted
  if (jobRun.status === 'completed' || jobRun.status === 'failed_exhausted' || jobRun.status === 'canceled') {
    return { claimStatus: 'terminal', leaseId: null, jobRun };
  }

  // Attempt to acquire the lease atomically
  const { rows: leaseRows } = await pool.query(
    `INSERT INTO job_leases (organization_id, job_run_id, owner_token, lease_generation, status, expires_at)
     VALUES ($1, $2, $3, $4, 'claimed', NOW() + INTERVAL '24 hours')
     ON CONFLICT (organization_id, job_run_id) DO UPDATE
       SET owner_token = EXCLUDED.owner_token,
           lease_generation = job_leases.lease_generation + 1,
           status = 'claimed',
           expires_at = NOW() + INTERVAL '24 hours',
           updated_at = NOW()
     WHERE job_leases.organization_id = $1
       AND job_leases.job_run_id = $2
       AND (job_leases.status = 'expired' OR job_leases.lease_generation < $4)
     RETURNING job_leases.id, job_leases.lease_generation, job_leases.status`,
    [orgId, jobRunId, ownerToken, leaseGeneration]
  );

  if (leaseRows.length === 0) {
    // Conflict — another worker has a newer or same-generation lease
    // Check the current lease state
    const { rows: currentLease } = await pool.query(
      'SELECT * FROM job_leases WHERE organization_id = $1 AND job_run_id = $2 ORDER BY lease_generation DESC LIMIT 1',
      [orgId, jobRunId]
    );
    if (currentLease.length > 0) {
      return {
        claimStatus: 'conflict',
        leaseId: currentLease[0].id,
        jobRun: { ...jobRun, status: currentLease[0].status },
      };
    }
    return { claimStatus: 'conflict', leaseId: null, jobRun };
  }

  // We acquired the lease
  return {
    claimStatus: 'acquired',
    leaseId: leaseRows[0].id,
    jobRun: { ...jobRun, status: leaseRows[0].status },
  };
}

/** Renew a lease for a job run that this worker already owns. */
export async function renewLease(
  orgId: string,
  jobRunId: string,
  ownerToken: string,
  currentGeneration: number
): Promise<{
  renewStatus: 'renewed' | 'stale' | 'conflict';
  leaseGeneration: number;
}> {
  const { rows } = await pool.query(
    `UPDATE job_leases
       SET expires_at = NOW() + INTERVAL '24 hours',
           lease_generation = job_leases.lease_generation + 1,
           updated_at = NOW()
     WHERE organization_id = $1
       AND job_run_id = $2
       AND owner_token = $3
       AND lease_generation = $4
     RETURNING lease_generation, status`,
    [orgId, jobRunId, ownerToken, currentGeneration]
  );

  if (rows.length === 0) {
    // Either the lease is held by another worker, or the generation has changed
    const { rows: currentLease } = await pool.query(
      'SELECT lease_generation, status, owner_token FROM job_leases WHERE organization_id = $1 AND job_run_id = $2 ORDER BY lease_generation DESC LIMIT 1',
      [orgId, jobRunId]
    );
    if (currentLease.length > 0) {
      return {
        renewStatus: 'stale',
        leaseGeneration: currentLease[0].lease_generation,
      };
    }
    return { renewStatus: 'conflict', leaseGeneration: 0 };
  }

  return {
    renewStatus: 'renewed',
    leaseGeneration: rows[0].lease_generation,
  };
}

/** Release a lease for a job run. */
export async function releaseLease(
  orgId: string,
  jobRunId: string,
  ownerToken: string
): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE job_leases
       SET status = 'released',
           owner_token = NULL,
           updated_at = NOW()
     WHERE organization_id = $1
       AND job_run_id = $2
       AND owner_token = $3
       AND status = 'claimed'
     RETURNING id`,
    [orgId, jobRunId, ownerToken]
  );

  return rows.length > 0;
}

/** Reclaim an expired lease (set status to expired if currently claimed). */
export async function reclaimExpiredLease(
  orgId: string,
  jobRunId: string,
  newOwnerToken: string,
  newLeaseGeneration: number
): Promise<{
  reclaimStatus: 'reclaimed' | 'not_owned' | 'already_expired';
  leaseGeneration: number;
}> {
  const { rows } = await pool.query(
    `UPDATE job_leases
       SET status = 'expired',
           owner_token = $3,
           lease_generation = $4,
           updated_at = NOW()
     WHERE organization_id = $1
       AND job_run_id = $2
       AND status = 'claimed'
     RETURNING lease_generation, status`,
    [orgId, jobRunId, newOwnerToken, newLeaseGeneration]
  );

  if (rows.length === 0) {
    // Check if the lease is already expired or held by someone else
    const { rows: currentLease } = await pool.query(
      'SELECT lease_generation, status, owner_token FROM job_leases WHERE organization_id = $1 AND job_run_id = $2 ORDER BY lease_generation DESC LIMIT 1',
      [orgId, jobRunId]
    );
    if (currentLease.length === 0) {
      return { reclaimStatus: 'already_expired', leaseGeneration: 0 };
    }
    if (currentLease[0].status === 'expired') {
      return { reclaimStatus: 'already_expired', leaseGeneration: currentLease[0].lease_generation };
    }
    return { reclaimStatus: 'not_owned', leaseGeneration: currentLease[0].lease_generation };
  }

  return {
    reclaimStatus: 'reclaimed',
    leaseGeneration: rows[0].lease_generation,
  };
}

/** Record an execution attempt for a job run. */
export async function recordExecutionAttempt(
  orgId: string,
  jobRunId: string,
  attemptNumber: number,
  ownerToken: string,
  leaseGeneration: number
): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO job_execution_attempts (
      organization_id, job_run_id, attempt_number, owner_token, lease_generation, started_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING *`,
    [orgId, jobRunId, attemptNumber, ownerToken, leaseGeneration]
  );
  return rows[0];
}

/** Mark a job run as completed successfully. */
export async function markJobCompleted(
  orgId: string,
  jobRunId: string,
  outcome: 'success' | 'failed' | 'external_error' | 'canceled',
  errorDetails?: any,
  recoveryReason?: string
): Promise<any> {
  const { rows } = await pool.query(
    `UPDATE scheduled_job_runs
       SET status = $2,
           attempt_count = attempt_count + 1,
           completed_at = NOW(),
           last_error = COALESCE(last_error, $3),
           updated_at = NOW()
     WHERE id = $1 AND organization_id = $4
     RETURNING *`,
    [jobRunId, outcome, errorDetails, orgId]
  );
  return rows[0];
}

/** Mark a job run as failed (exhausted retries). */
export async function markJobFailedExhausted(
  orgId: string,
  jobRunId: string
): Promise<any> {
  const { rows } = await pool.query(
    `UPDATE scheduled_job_runs
       SET status = 'failed_exhausted',
           attempt_count = attempt_count + 1,
           updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [jobRunId, orgId]
  );
  return rows[0];
}

/** Get a job run by ID with organization scoping. */
export async function getJobRun(id: string, orgId: string): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT sjr.*, s.cadence, s.report_id, s.format, s.recipients, s.params,
            s.run_count, s.max_runs, s.next_run_at
     FROM scheduled_job_runs sjr
     JOIN report_schedules s ON sjr.schedule_id = s.id AND sjr.organization_id = s.organization_id
     WHERE sjr.id = $1 AND sjr.organization_id = $2`,
    [id, orgId]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

/** Get all execution attempts for a job run. */
export async function getExecutionAttempts(
  orgId: string,
  jobRunId: string
): Promise<any[]> {
  const { rows } = await pool.query(
    'SELECT * FROM job_execution_attempts WHERE organization_id = $1 AND job_run_id = $2 ORDER BY attempt_number',
    [orgId, jobRunId]
  );
  return rows;
}

/** Get all leases for a job run (should typically be 1). */
export async function getLeases(
  orgId: string,
  jobRunId: string
): Promise<any[]> {
  const { rows } = await pool.query(
    'SELECT * FROM job_leases WHERE organization_id = $1 AND job_run_id = $2 ORDER BY lease_generation DESC',
    [orgId, jobRunId]
  );
  return rows;
}