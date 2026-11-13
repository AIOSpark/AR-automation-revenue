# AIOSpark HIGH-012 — Backup and Restore Verification

Date: 2026-11-11
Scope: Automated daily backup with verified, isolated recovery for the authoritative SQLite repository.

## What changed

`scripts/sqlite-backup.mjs` was replaced (manual checkpoint-and-copy) with:

- **Consistent snapshot:** SQLite `VACUUM INTO` reads one committed transaction, including uncheckpointed WAL pages. Live database and WAL files are never copied directly.
- **Verify before publish:** temporary snapshot is checked for `integrity_check`, `foreign_key_check`, required tables, schema migration version, valid JSON snapshots, and financial record counts, then fsynced and atomically renamed.
- **Failure preservation:** any failure leaves the previously published backup untouched and removes temporary files.
- **Retention:** managed backups are rotated by count (default 14), newest kept; unrelated files untouched.
- **Failure detection:** `backup-failure.json` and an optional generic JSON webhook (`AIOSPARK_BACKUP_ALERT_WEBHOOK`); no provider assumed.
- **Automated schedule:** `schedule` runs daily at `AIOSPARK_BACKUP_HOUR_UTC` (default 02:00 UTC); `--once` for cron/CI.
- **Isolated restore verification:** `restore-verify` copies the backup into a fresh temp directory, opens it read-only, verifies integrity/schema/financial counts, then deletes the temp copy. The live database is never opened or modified.
- **Explicit restore:** `restore --force` verifies the source and temporary target before atomic replacement; refuses to overwrite without `--force`.
- **No financial data in logs/alerts:** output contains paths, size, SHA-256, schema version and counts only.

## Commands

```bash
npm run backup
npm run backup:verify -- <backup.sqlite>
npm run backup:restore-verify -- <backup.sqlite>
npm run backup:schedule
node scripts/sqlite-backup.mjs schedule --once
```

Runbook: `docs/runbooks/BACKUP_RESTORE_RUNBOOK.md`.

## Verification

`npm run test:backup` — **11/11 passed**.

Covered:

- Committed WAL-only rows survive backup.
- Schema version and financial counts (customers, invoices, payments, matches, credit notes, allocations) are preserved.
- Retention keeps the newest backup and leaves unrelated files.
- Failed backup preserves the previous published backup and leaves no temp files.
- Failure webhook receives the failure event with no customer name or invoice ID.
- Restore verification runs in isolation and leaves the live file hash unchanged.
- Corrupt/non-SQLite backups are rejected.
- CLI verification reports schema/counts only.
- Automated `schedule --once` produces a valid backup.
- Explicit backup path works; invalid retention config fails closed.
- Live database remains unchanged after all verification paths.

## Acceptance mapping

| Requirement | Result |
|---|---|
| Automated daily backup | `schedule` daemon + `--once`; tested |
| Failure detection and alerts | Exit 1, failure JSON, optional webhook; tested |
| Integrity verification | integrity/foreign key/schema/JSON checks; tested |
| Restore into isolated database | `restore-verify`; tested |
| Financial records survive | counts verified after backup and isolated restore |
| Retention/rotation | count-based rotation; tested |
| Recovery runbook | `docs/runbooks/BACKUP_RESTORE_RUNBOOK.md` |
| Full verification | `npm run verify` includes `test:backup` |

## Boundaries

- RPO is one daily cycle (up to 24 hours); RTO depends on host/storage operations.
- Off-host, encrypted backup replication remains an operator responsibility; the tooling makes no cloud-provider assumption.
- Verification proves the backup is internally consistent and contains the expected financial record counts; it is not a business-level reconciliation against external systems.
- HIGH-010 residual approvals/billing concurrency risks remain separate. HIGH-009 relational normalization remains partial.
