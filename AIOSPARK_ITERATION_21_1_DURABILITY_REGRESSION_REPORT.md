# AIOSPARK — ITERATION 21.1
# PERMANENT DURABILITY AND PILOT SECURITY REGRESSION TESTS
# Regression Report

**Baseline commit:** 6675c97 (chore: establish reproducible AIOSpark baseline)
**Iteration 19–20 changes:** staged, uncommitted (20 files in the index)
**Report date:** 2026-11-06
**Committed or pushed:** No (per execution rules)

---

## 1. Tests transferred from temporary scripts

The following standalone verification scripts lived under `/tmp/opencode/` and were executed ad-hoc during Iteration 21. Their coverage has been converted into permanent repository tests under `src/lib/testing/__tests__/` plus runner scripts under `scripts/`.

| Temporary script (`/tmp/opencode/`) | Permanent test | Runner |
|---|---|---|
| `aiospark-restart-write.mjs` / `aiospark-restart-read.mjs` (SQLite restart + import + reconciliation + backup/restore + tenant isolation) | `src/lib/testing/__tests__/sqlite-durability.test.ts` + `sqlite-durability-reader.ts` | `scripts/test-durability.mjs` |
| `aiospark-pilot-test.mjs` (pilot mode restart + enforce + CSRF/tenant) | `src/lib/testing/__tests__/pilot-security.test.ts` + `pilot-security-reader.ts` | `scripts/test-pilot-security.mjs` |
| `aiospark-csrf-tenant-test.mjs` (cross-origin / missing-origin / same-origin CSRF + tenant isolation) | Covered by `pilot-security.test.ts` (Phase 5 CSRF) and existing `master.test.ts` Sections 1–2 (cross-tenant penetration) | n/a |

The temporary scripts and the scratch SQLite files under `/tmp/opencode/` remain classified as standalone/exploratory and are **not** part of the official test pipeline.

### What was NOT copied blindly
- The standalone scripts hard-coded absolute import paths to `/home/subham/...` and set `process.env` after imports (ineffective under ESM hoisting). The permanent tests read `AIOSPARK_DB_PATH` from the process environment **before** Node starts (set in the runner scripts / npm script prefix), so `durable-repository` binds to a real temp file at module load.
- The standalone restart writer checked WAL checkpointing manually; the permanent tests rely on `closeDatabase()` (clean shutdown) followed by a fresh reader process opening the same file.
- Temporary assertions were validated against the real store signatures (`Customer`/`Invoice`/`BankTransaction` require `source_system`/`source_id`/`tax_amount_minor_units`; `ImportPipelineConfig` uses `organizationId`; `AuditStore.query` uses `organizationId`) and type errors were fixed.

---

## 2. Tests already present (no new coverage needed)

The following areas already had permanent tests in `master.test.ts` and were left untouched:
- Cross-tenant RLS & direct access (Section 1)
- API rate limiting & backup restoration (Section 1)
- AI safety guardrails (Section 1)
- Import pipeline, pilot pipeline, integration engine (Section 2)
- Reasoning, taxonomy, advanced intelligence, next-best-action, cash-unblock simulator/queue (Section 4)
- Agents & orchestration, approvals, promises, communication (Sections 5–7)
- Reconciliation, CFO, reports, alerts, audit, billing, observability, beta, discipline (Sections 7 + others)
- O2C Core E2E (Section 8: 27/27)
- Performance & load (Section 13)
- Stable interface discipline (Section 13 area)

The durability and pilot-security sections that had been integrated into `master.test.ts` (Sections 9 & 10) were **removed** from `master.test.ts` because they cannot share the master process: they require file-backed SQLite (`AIOSPARK_TEST_MODE=false`) while the master suite runs `:memory:` (`AIOSPARK_TEST_MODE=true`), and their `closeDatabase()` calls close the shared `durable-repository` singleton, breaking all subsequent sections ("statement has been finalized" / "database is not open"). They now run as standalone official scripts (`test:durability`, `test:pilot-security`).

---

## 3. Permanent verification coverage

### Durability (`scripts/test-durability.mjs` → `sqlite-durability.test.ts`, 27 assertions)
Run with `AIOSPARK_DB_PATH=<temp> AIOSPARK_TEST_MODE=false`:
1. Import customers and invoices (UDM write path persists to SQLite snapshot)
2. Persist import batch history (`import_batches` namespace)
3. Persist reconciliation outcomes (`reconciliation_outcomes` namespace)
4. Close the database (`closeDatabase()`, clean shutdown)
5. Start a separate application process (reader via `tsx` child process)
6. Reopen the same SQLite file (`AIOSPARK_DB_PATH`)
7. Verify financial balances (invoice outstanding, partially_paid→paid after reconciliation)
8. Verify import and reconciliation histories (direct snapshot reads via `readSnapshotDirect`)
9. Verify tenant boundaries (Org A data not visible from Org B context after restart)
10. Verify backup/restore-equivalence (independent direct SQLite reads of every namespace)
- Temp DB file per run; `closeDatabase()` in both writer and reader.

### Pilot security (`scripts/test-pilot-security.mjs` → `pilot-security.test.ts`, 28 assertions)
Run with `AIOSPARK_DB_PATH=<temp> AIOSPARK_TEST_MODE=false`; uses synthetic organizations:
- Pilot mode survives restart (fresh `AuthStore` in new process reads `pilotMode === true` from SQLite)
- Ordinary users cannot disable pilot mode (`setPilotMode`/`validatePilotReadOnly` enforcement)
- Finance Viewer/Executive cannot execute financial mutations (all 7 prohibited actions return 403 on pilot org; allowed on normal org)
- Finance Executive cannot bypass pilot restrictions (same `validatePilotReadOnly` path)
- Cross-tenant writes rejected (existing penetration suite + UDM/R tenant isolation)
- Cross-origin requests rejected (`isCsrfRequestSafe`)
- Missing-Origin state-changing requests rejected (Iteration 20 fix)
- Same-origin authorized requests work; GET requests allowed

Both suites exit non-zero on any failure.

---

## 4. Three-run determinism

Each new suite was run three times consecutively with fresh temp DBs:

| Suite | Run 1 | Run 2 | Run 3 | Deterministic? |
|---|---|---|---|---|
| `test:durability` | 27 passed, 0 failed, exit 0 | 27 passed, 0 failed, exit 0 | 27 passed, 0 failed, exit 0 | Yes |
| `test:pilot-security` | 28 passed, 0 failed, exit 0 | 28 passed, 0 failed, exit 0 | 28 passed, 0 failed, exit 0 | Yes |

No flakiness observed. Temp DB files are recreated per run; assertions key off randomly generated record IDs, so accumulated stale data from prior runs does not affect results.

---

## 5. Complete regression results

| Step | Tool / command | Result | Exit code |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | Pass | 0 |
| ESLint | `npx eslint` | Pass | 0 |
| Secret scan | `node scripts/security-scan.mjs` | Clean — zero hardcoded secrets | 0 |
| Master suite | `npm run test:master` | 184 passed, **2 failed** (pre-existing, see §6) | 1 |
| Financial stress | `AIOSPARK_TEST_MODE=true tsx scripts/test-financial-stress.mjs` | Pass | 0 |
| O2C E2E | `AIOSPARK_TEST_MODE=true tsx scripts/test-e2e.mjs` | 7 passed, 0 failed | 0 |
| (O2C also in master Section 8) | master Section 8 | 27 passed, 0 failed | — |
| Durability tests | `npm run test:durability` | 27 passed, 0 failed | 0 |
| Pilot security tests | `npm run test:pilot-security` | 28 passed, 0 failed | 0 |
| `npm run verify` (full pipeline) | lint → typecheck → scan → master → stress → durability → pilot | **Exit 1** (only the 2 pre-existing master failures; durability & pilot run and pass) | 1 |
| Production build | `npm run build` | Pass | 0 |

### Pre-existing master-suite failures (NOT caused by this iteration)
Both failures are in files untouched by this iteration and predate it:
1. **Section 1 — Security Layer Suite:** `Failed to create authz test session token` (`src/lib/auth/__tests__/security.test.ts`).
2. **Section 2 — Data Integration Engine:** `SSRF Guard: Localhost bridge endpoint is allowed in explicit test mode` (`src/lib/integrations/__tests__/sync-engine.test.ts`).

These are unrelated to durability/pilot security and are documented as limitations (§6). They do not affect the new regression tests.

---

## 6. Remaining limitations

- `npm run verify` exits non-zero (1) solely because of the two pre-existing master-suite failures above; durability and pilot security pass and are correctly gated to non-zero on failure.
- The master suite continues to run `:memory:` (`AIOSPARK_TEST_MODE=true`) so existing behavior is preserved; durability and pilot security run as separate file-backed processes because they cannot share the master process.
- ACME discovery is incomplete: the seven Finance Controller questions remain unanswered; per the product audit the product is not yet qualified for a real pilot.
- No production or partner financial data was used; all tests use synthetic organizations.
- Temporary/exploratory scripts under `/tmp/opencode/` are intentionally excluded from the repository pipeline.

---

## 7. Commit readiness (Iterations 19–21)

### Staged (index) — 20 files, pre-existing Iteration 19–20 work
`src/app/api/billing/route.ts`, `src/app/api/collections/route.ts`, `src/app/api/onboarding/import/route.ts`, `src/lib/auth/csrf.ts`, `src/lib/auth/dev-mode.ts`, `src/lib/auth/pilot.ts`, `src/lib/db/durable-repository.ts`, `src/lib/execution/service.ts`, `src/lib/import/engine.ts`, `src/lib/intelligence/advanced-engine.ts`, `src/lib/intelligence/next-best-action-engine.ts`, `src/lib/master.test.ts`, `src/lib/reconciliation/engine.ts`, `src/lib/tenant/store.ts`, `src/lib/testing/__tests__/o2c-core-e2e.test.ts`, `src/lib/testing/__tests__/pilot-security-reader.ts`, `src/lib/testing/__tests__/pilot-security.test.ts`, `src/lib/testing/__tests__/sqlite-durability-reader.ts`, `src/lib/testing/__tests__/sqlite-durability.test.ts`, `src/lib/unblock-queue/engine.ts`

### Unstaged modifications (this iteration — preserved, not staged)
- `package.json`: added `test:durability`, `test:pilot-security` scripts; rewrote `verify` to execute all steps and aggregate exit codes.
- `src/lib/master.test.ts`: removed durability/pilot sections (cannot share master process); fixed pre-existing `sec10*` variable-reference bug in the Accessibility section.
- `src/lib/testing/__tests__/sqlite-durability.test.ts`: fixed type errors (`source_system`/`source_id`/`tax_amount_minor_units`/`organizationId`, `DB_PATH`→`dbPath`, `execFileSync` string vs `.stdout`).
- `src/lib/testing/__tests__/sqlite-durability-reader.ts`: fixed type errors (`count` vs `passed`, `getOrgLogs`→`query`, `passed`→`count`); corrected invoice-status assertion to post-reconciliation `paid`.
- `src/lib/testing/__tests__/pilot-security.test.ts`: fixed type errors (`pilotOrg` redeclare, missing `approvalStore` import, `insertCustomer` fields, `execFileSync` string vs `.stdout`); use actual generated organization IDs instead of a non-matching hardcoded ID.

### New files (this iteration — untracked, not staged per execution rules)
- `scripts/test-durability.mjs`
- `scripts/test-pilot-security.mjs`

### Source modifications caused by confirmed defects
None in production source. All fixes are in test files (type errors) and the test pipeline (`package.json` `verify`, `master.test.ts` variable bug). No production source was weakened or changed.

### Recommendation
**Iterations 19–21 are NOT yet ready for one coherent commit** because:
- `npm run verify` exits non-zero due to two pre-existing master-suite failures (authz token crash, SSRF guard) that should be investigated/fixed first.
- The staged index contains the pre-iteration-21.1 versions of `master.test.ts` and the durability/pilot test files; the iteration-21.1 fixes live unstaged. A coherent commit would need to reconcile staged vs. working-tree state.
- ACME discovery (seven Finance Controller answers) remains outstanding, which per the audit blocks pilot qualification regardless of engineering state.

Engineering (durability + pilot security regression) is complete and repeatable; commercial discovery (ACME) remains the gating milestone.
