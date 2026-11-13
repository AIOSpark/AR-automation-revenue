# AIOSpark SQLite Backup and Recovery Runbook

Last updated: 2026-11-11
Applies to: the authoritative SQLite repository (`repository_snapshots` + `repository_schema_migrations`).

## 1. Safety model

- Backups are produced with SQLite `VACUUM INTO`, which reads one committed transaction snapshot and includes uncheckpointed WAL data. The utility never copies live `-wal`/`-shm` files.
- A backup is written to a temporary file, verified, fsynced, then atomically renamed into place. A failed backup never replaces the previous published backup.
- Verification opens the backup read-only and checks `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, the schema migration version, every snapshot's JSON, and financial record counts.
- Restore verification copies the backup into a fresh temporary directory and opens only that copy. It never opens, overwrites, or writes to the live database.
- Logs and alerts contain paths, sizes, schema version and record counts. They must not contain customer names, amounts, emails, raw rows, tokens or credentials.
- A backup contains customer financial data. Store it on encrypted media with access controls and copy it off the application host. This runbook does not assume any cloud provider.

## 2. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AIOSPARK_DB_PATH` | `.data/aiospark.sqlite` | Live database path |
| `AIOSPARK_BACKUP_DIR` | `.data/backups` | Managed backup directory |
| `AIOSPARK_BACKUP_RETENTION_COUNT` | `14` | Number of daily backups to keep |
| `AIOSPARK_BACKUP_HOUR_UTC` | `2` | Daily scheduler hour (UTC) |
| `AIOSPARK_BACKUP_ALERT_WEBHOOK` | unset | Optional generic JSON webhook for failure alerts |

The database must be on durable storage and the backup directory must not be the same failing volume as the live database in production. Off-host replication is an operator responsibility.

## 3. Manual backup

```bash
AIOSPARK_DB_PATH=/var/lib/aiospark/aiospark.sqlite \
AIOSPARK_BACKUP_DIR=/var/backups/aiospark \
npm run backup
```

The command prints only metadata:

```text
Backup: /var/backups/aiospark/aiospark-backup-20261111T020000000Z.sqlite
  sizeBytes: ...
  sha256: ...
  integrity: ok
  schemaVersion: 1
  snapshots: 12
  financialCounts: customers=... invoices=... payments=... matches=... creditNotes=... creditAllocations=...
```

A non-zero exit code means the backup failed. Check `backup-failure.json` in the backup directory and the alert webhook.

## 4. Automated daily backup

Run the built-in scheduler as a long-lived service:

```bash
AIOSPARK_DB_PATH=/var/lib/aiospark/aiospark.sqlite \
AIOSPARK_BACKUP_DIR=/var/backups/aiospark \
AIOSPARK_BACKUP_RETENTION_COUNT=14 \
AIOSPARK_BACKUP_ALERT_WEBHOOK=https://ops.example.com/hooks/aiospark-backup \
npm run backup:schedule
```

It runs once at the configured UTC hour, then every 24 hours. A process supervisor (systemd, container restart policy, or equivalent) should keep it running.

For cron instead of the daemon:

```cron
0 2 * * * cd /srv/aiospark && AIOSPARK_DB_PATH=/var/lib/aiospark/aiospark.sqlite AIOSPARK_BACKUP_DIR=/var/backups/aiospark npm run backup >> /var/log/aiospark-backup.log 2>&1
```

`--once` runs a single cycle and is the supported CI/cron smoke path:

```bash
node scripts/sqlite-backup.mjs schedule --once
```

## 5. Integrity verification

```bash
npm run backup:verify -- /var/backups/aiospark/aiospark-backup-YYYY....sqlite
```

This is read-only. It fails if the file is missing, empty, not a SQLite database, fails integrity/foreign-key checks, lacks the schema tables, has no migration version, contains invalid snapshot JSON, or does not carry the expected financial arrays.

## 6. Restoration drill (required, non-destructive)

Run after every backup-policy change and at least monthly:

```bash
npm run backup:restore-verify -- /var/backups/aiospark/aiospark-backup-YYYY....sqlite
```

The command:

1. Creates a new temporary directory.
2. Copies the backup there.
3. Opens the isolated copy read-only.
4. Verifies integrity, foreign keys, schema version, JSON snapshots and financial counts.
5. Deletes the temporary directory.

The live database is not opened or modified. Record the drill date, backup name, schema version, financial counts and result in the operations log. A drill that cannot confirm the expected financial counts is a failed recovery test.

## 7. Actual restore

**Stop the application first.** Do not restore while any process has the database open.

1. Take a fresh backup of the current live database, if it is readable:
   ```bash
   npm run backup
   ```
2. Verify the chosen recovery point:
   ```bash
   npm run backup:restore-verify -- /var/backups/aiospark/aiospark-backup-YYYY....sqlite
   ```
3. Restore explicitly, with force:
   ```bash
   node scripts/sqlite-backup.mjs restore \
     /var/backups/aiospark/aiospark-backup-YYYY....sqlite \
     /var/lib/aiospark/aiospark.sqlite --force
   ```
   The tool verifies the source, copies to a temporary target, verifies the copy, then atomically replaces the destination. Without `--force` it refuses to overwrite an existing database.
4. Start the application and run:
   ```bash
   npm run verify
   ```
5. Confirm expected invoice, payment, match, credit-note and allocation counts against the recovery point.

## 8. Recovery boundaries

- **RPO:** up to 24 hours with the daily schedule. Any committed transaction after the last successful backup is lost.
- **RTO:** time to stop the app, verify the backup, copy it to the host and restart; typically minutes for a single-instance SQLite deployment, but it depends on storage and host setup.
- A backup captures the SQLite repository at one committed point. It does not capture external provider state (ERP, bank, email, Razorpay) or credentials outside the database.
- WAL is included through the consistent snapshot; do not manually copy the live database file as a substitute.
- If verification fails, do not restore that backup. Select an older verified backup, preserve the failed file for diagnosis, and escalate.
- Backups on the same host do not survive host loss. Maintain an off-host encrypted copy and test restoration from that copy, not just the local one.

## 9. Failure handling

A failed cycle writes `backup-failure.json` and optionally POSTs:

```json
{
  "event": "aiospark.backup.failed",
  "status": "failed",
  "startedAt": "...",
  "failedAt": "...",
  "durationMs": 123,
  "error": "Live database not found: ..."
}
```

The previous published backup is preserved. Operators should:

1. Check disk space, permissions, database path and backup directory.
2. Check that no process holds an exclusive lock for longer than the busy timeout.
3. Run a manual backup and `backup:restore-verify`.
4. If the failure persists, escalate before the next RPO window passes.

## 10. Verification commands

```bash
npm run test:backup       # backup, WAL, retention, alert, corruption, isolated restore
npm run test:durability   # SQLite restart durability
npm run verify            # full regression suite
```
