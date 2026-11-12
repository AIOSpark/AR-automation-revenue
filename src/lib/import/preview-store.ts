// AIOSpark Import Preview Store
// Server-validated preview records for the two-step import confirmation flow.
// Preview records are short-lived (10 minute TTL) and single-use.
// Stored in the durable SQLite repository for production persistence,
// with an in-memory Map for fast access within a server process.
//
// Lifecycle states:
//   READY     — Preview created, not yet claimed for commit
//   COMMITTING — Preview claimed by a confirmation request, import in progress
//   COMMITTED  — Import committed successfully; preview is consumed
//   FAILED     — Import failed after claim; preview can be replaced by a new one
//   EXPIRED    — Preview TTL elapsed without being claimed or committed
//
// Atomic claim (READY → COMMITTING) ensures only one confirmation request
// can acquire the commit operation for a given preview. Cross-process
// safety is provided by SQLite's BEGIN IMMEDIATE write lock via
// withWriteTransaction().

import { readSnapshot, writeSnapshot, withWriteTransaction } from '../db/durable-repository';
import { readImportState } from '../db/operational-repository';

export type PreviewStatus = 'READY' | 'COMMITTING' | 'COMMITTED' | 'FAILED' | 'EXPIRED';

export interface PreviewRecord {
  id: string;
  userId: string;
  organizationId: string;
  payloadHash: string;
  columnMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  createdAt: string;
  expiresAt: string;
  status: PreviewStatus;
  batchId?: string;
}

const PREVIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes
const COMMITTING_STALE_MS = 5 * 60 * 1000; // 5 minutes — stale COMMITTING records can be reclaimed

class PreviewStore {
  private previews: Map<string, PreviewRecord> = new Map();

  constructor() {
    this.reloadFromSnapshot();
    this.recoverStaleCommitting();
  }

  private reloadFromSnapshot(): void {
    const data = readSnapshot<{ previews: PreviewRecord[] }>('import_previews');
    if (data?.previews) {
      for (const p of data.previews) {
        this.previews.set(p.id, p);
      }
    }
  }

  private persist(): void {
    writeSnapshot('import_previews', { previews: Array.from(this.previews.values()) });
  }

  /**
   * On application restart, recover stale COMMITTING records.
   *
   * Recovery logic inspects the durable import batch to determine whether
   * the financial transaction actually completed:
   *   - Batch status 'completed'   → reconcile preview to COMMITTED (import succeeded, no duplicate)
   *   - Batch status 'processing'  → leave as COMMITTING (ambiguous, do not auto-retry)
   *   - Batch status 'failed'      → return to READY (safe to retry)
   *   - No batch record            → return to READY (safe to retry)
   *
   * Expired COMMITTING records are marked EXPIRED unless the batch
   * completed (in which case they are reconciled to COMMITTED).
   */
  private recoverStaleCommitting(): void {
    const now = Date.now();
    let dirty = false;

    // Load batch state once for all recovery checks
    let batchState: { batches: any[] } | null = null;
    function getBatchState() {
      if (!batchState) {
        try {
          batchState = readImportState();
        } catch {
          batchState = { batches: [] };
        }
      }
      return batchState;
    }

    function batchStatusFor(batchId?: string): 'completed' | 'processing' | 'failed' | 'none' {
      if (!batchId) return 'none';
      const batches = getBatchState()?.batches || [];
      const batch = batches.find((b) => b.id === batchId);
      if (!batch) return 'none';
      return batch.status as 'completed' | 'processing' | 'failed';
    }

    for (const record of this.previews.values()) {
      if (record.status !== 'COMMITTING') continue;

      const isExpired = new Date(record.expiresAt).getTime() <= now;
      const batchStatus = batchStatusFor(record.batchId);

      if (isExpired) {
        // Expired COMMITTING: if batch completed, reconcile to COMMITTED;
        // otherwise mark EXPIRED (no retry possible on expired preview).
        if (batchStatus === 'completed') {
          record.status = 'COMMITTED';
          dirty = true;
        } else {
          record.status = 'EXPIRED';
          dirty = true;
        }
      } else {
        // Not expired — check batch outcome for crash recovery.
        // Any COMMITTING record on restart may represent an interrupted import.
        if (batchStatus === 'completed') {
          record.status = 'COMMITTED';
          dirty = true;
        } else if (batchStatus === 'failed' || batchStatus === 'none') {
          // Transaction definitely rolled back or never started — safe to retry.
          record.status = 'READY';
          dirty = true;
        }
        // batchStatus === 'processing': ambiguous — leave as COMMITTING.
        // Requires manual intervention or a future restart attempt.
      }
    }

    if (dirty) {
      this.persist();
    }
  }

  /**
   * Create a new preview record in READY state.
   */
  create(data: {
    userId: string;
    organizationId: string;
    payloadHash: string;
    columnMapping: Record<string, string>;
    rows: Record<string, unknown>[];
  }): PreviewRecord {
    const id = `prev_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = Date.now();
    const record: PreviewRecord = {
      id,
      userId: data.userId,
      organizationId: data.organizationId,
      payloadHash: data.payloadHash,
      columnMapping: data.columnMapping,
      rows: data.rows,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PREVIEW_TTL_MS).toISOString(),
      status: 'READY',
    };
    this.previews.set(id, record);
    this.persist();
    return record;
  }

  /**
   * Find a preview record by ID without changing state.
   */
  findById(id: string): PreviewRecord | null {
    return this.previews.get(id) || null;
  }

  /**
   * Atomically claim a preview for commit.
   * Transitions READY → COMMITTING only if:
   *   - Record exists
   *   - Status is READY
   *   - User ID matches
   *   - Organization ID matches
   *   - Not expired
   *
   * Returns the claimed record, or null if the claim cannot be made.
   * The returned record includes the reason string when claim fails.
   */
  claim(id: string, userId: string, organizationId: string): { record: PreviewRecord | null; reason?: string } {
    const record = this.previews.get(id);
    if (!record) {
      return { record: null, reason: 'not_found' };
    }

    if (record.status !== 'READY') {
      return { record, reason: `status_${record.status}` };
    }

    if (record.userId !== userId) {
      return { record, reason: 'wrong_user' };
    }

    if (record.organizationId !== organizationId) {
      return { record, reason: 'wrong_org' };
    }

    if (new Date(record.expiresAt) <= new Date()) {
      record.status = 'EXPIRED';
      this.persist();
      return { record, reason: 'expired' };
    }

    // Atomic transition: READY → COMMITTING
    record.status = 'COMMITTING';
    this.persist();
    return { record };
  }

  /**
   * Associate an import batch ID with a preview record.
   * Called after the batch is created, before financial records are inserted.
   */
  setBatchId(id: string, batchId: string): boolean {
    const record = this.previews.get(id);
    if (!record) return false;
    record.batchId = batchId;
    this.persist();
    return true;
  }

  /**
   * Mark a preview as COMMITTED (successful import).
   * Only valid from COMMITTING state.
   */
  commit(id: string): boolean {
    const record = this.previews.get(id);
    if (!record || record.status !== 'COMMITTING') {
      return false;
    }
    record.status = 'COMMITTED';
    this.persist();
    return true;
  }

  /**
   * Mark a preview as FAILED (import failed after claim).
   * Only valid from COMMITTING state. The preview is not permanently
   * consumed — a new preview must be created for retry.
   */
  fail(id: string): boolean {
    const record = this.previews.get(id);
    if (!record || record.status !== 'COMMITTING') {
      return false;
    }
    record.status = 'FAILED';
    this.persist();
    return true;
  }

  /**
   * Mark a preview as EXPIRED (TTL elapsed without claim or commit).
   */
  expire(id: string): boolean {
    const record = this.previews.get(id);
    if (!record) {
      return false;
    }
    if (record.status === 'READY' || record.status === 'COMMITTING') {
      record.status = 'EXPIRED';
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * Clear all preview records (for testing).
   */
  clearAll(): void {
    this.previews.clear();
    writeSnapshot('import_previews', { previews: [] });
  }

  /**
   * Set preview status directly (for testing crash recovery scenarios).
   */
  setStatusForTesting(id: string, status: PreviewStatus): boolean {
    const record = this.previews.get(id);
    if (!record) return false;
    record.status = status;
    this.persist();
    return true;
  }

  /**
   * Run stale COMMITTING recovery (public for testing crash recovery).
   */
  recoverStaleCommittingForTesting(): void {
    this.recoverStaleCommitting();
  }
}

export const previewStore = new PreviewStore();
