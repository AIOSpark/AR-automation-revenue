# AIOSPARK CI/CD FORENSIC AUDIT

**Task:** TASK 001 — CI/CD Forensic Investigation (investigation only)
**Status:** Complete
**Branches investigated:** `main`, `high-008-baseline`
**Application source modified:** No
**Package dependencies modified:** No
**Workflow files modified:** No
**Branches merged:** No

---

## 1. Executive summary

A forensic investigation was performed on the GitHub Actions CI/CD pipeline for the `AIOSpark Automated Release & Quality Gate Pipeline` (`.github/workflows/ci-cd.yml`) across two branches: `main` (release branch) and `high-008-baseline` (development candidate). Every workflow-equivalent command was executed locally on both branches and results recorded.

**Key finding:** `main` is functionally green (all suites pass; the only local typecheck noise is caused by stale `.next/` build artifacts, not source code). `high-008-baseline` is **red**: it introduces 5 lint errors and a systemic database defect (`UNIQUE constraint failed: audit_events.id`) that cascades into failures in `test:master` (O2C Core E2E), `test:financial-stress`, `test:durability`, and `test:financial` (2 idempotency cases). The root cause is a non-unique primary-key insert into `audit_events` (`id TEXT PRIMARY KEY`) in the new governance repository layer added by `high-008-baseline`.

**Secondary finding (workflow configuration):** `high-008-baseline` is not listed in the workflow's branch filters (`push`/`pull_request` target `main` only), so CI never runs on the development candidate. The workflow also omits `test:financial-stress`, `test:durability`, and `test:pilot-security` from its gates, and does not test the merged PR result (no `merge_group`).

---

## 2. Exact commit SHA for each branch

| Branch | Commit SHA | Commit message | Tracking |
|--------|------------|----------------|----------|
| `main` | `1b2b3c394cd286ab3532dd323a94544928f3a383` | commmit | `origin/main` (up to date) |
| `high-008-baseline` | `ba8ee7ed100067ececc21f4bd6a2e7e62409a598` | commit | `origin/high-008-baseline` (up to date) |

---

## 3. Workflow architecture

**File:** `.github/workflows/ci-cd.yml` (84 lines). Single workflow, single job.

### Triggers & branch filters
- `push`: branches `[ main ]`
- `pull_request`: branches `[ main ]`

`high-008-baseline` is **excluded** from both triggers. Pushes to, or PRs targeting, `high-008-baseline` do not start CI. Confirmed: no `merge_group` trigger, so the merged PR result (PR branch + main) is not tested; PRs to `main` run CI on the PR head ref only.

### Runner & environment
- `runs-on: ubuntu-latest`
- Node.js: `node-version: '22'`, `cache: 'npm'` (actions/setup-node@v4)
- Local reproduction Node: `v26.7.0` (satisfies `engines.node: >=22`; `.nvmrc` = 22)

### Job: `quality-gate` — AIOSpark Quality & Release Security Gate
Steps in order:

| Gate | Step | Command | Runs on |
|------|------|---------|---------|
| — | Checkout Code Repository | `actions/checkout@v4` | all |
| — | Setup Node.js Environment | `actions/setup-node@v4` | all |
| — | Install Project Dependencies | `npm ci` | all |
| Gate 1 | Static Validation (ESLint) | `npm run lint` | all |
| Gate 2 | Type Validation (TypeScript) | `npm run typecheck` | all |
| Gate 3 | Secret & Dependency Security Scan | `npm run test:scan` | all |
| Gate 4 | Isolated Unit Tests | `npm run test:unit` | all |
| Gate 5 | Enterprise Integration Tests | `npm run test:integration` | all |
| Gate 6 | Security, RLS & Tenant Isolation Tests | `npm run test:security` | all |
| Gate 7 | Financial Correctness & Golden Tests | `npm run test:financial` | all |
| Gate 8 | Master Verification Suite | `npm run test:master` | all |
| Gate 9 | Production Next.js Optimized Build | `npm run build` | all |
| Gate 10 | Critical End-to-End User Journeys | `npm run test:e2e` | all |
| Gate 11 | Post-Deployment Smoke & Health Verification | `npm run test:smoke` | all |
| Gate 12 | Real Staging ERP, Email & Deployment Verification | `npm run test:external` | **conditional** — only `push` to `refs/heads/main` AND `secrets.AIOSPARK_DEPLOYMENT_URL != ''` |
| — | Generate Production Release Notes & Changelog | `node scripts/generate-changelog.mjs` | `ref == refs/heads/main` |
| — | Upload Build Artifacts & Release Notes | `actions/upload-artifact@v4` | all |

### Referenced workflow scripts
The workflow invokes only `npm` scripts; there are no separate composite/reusable workflow scripts. The npm scripts map to:
- `test:scan` → `scripts/security-scan.mjs`
- `test:master` → `scripts/test-master.mjs` → `src/lib/master.test.ts`
- `test:unit` → `src/lib/testing/__tests__/unit.test.ts`
- `test:integration` → `src/lib/testing/__tests__/integration-ci.test.ts`
- `test:security` → `src/lib/testing/__tests__/security-ci.test.ts`
- `test:financial` → `src/lib/testing/__tests__/financial.test.ts`
- `test:e2e` → `src/lib/testing/__tests__/e2e-journeys.test.ts`
- `test:smoke` → `src/lib/testing/__tests__/smoke.test.ts`
- `test:external` → `scripts/test-external-release.mjs` (requires secrets)

### Notable workflow gaps
1. `high-008-baseline` absent from `push`/`pull_request` branch filters → CI never exercises the development candidate.
2. `test:financial-stress`, `test:durability`, `test:pilot-security` are **not** workflow gates (they exist in `package.json` but are absent from `.github/workflows/ci-cd.yml`). Failures in these suites on `high-008-baseline` would be invisible to CI.
3. `npm run test` (`verify`) uses `set +e` (bash-ism) and aggregates exit codes, but the workflow calls each script as a separate step, so step-level failure is honored.

---

## 4. Every failed job and step

### Branch `main` — no confirmed defects
| Command | Exit | Status | Notes |
|---------|------|--------|-------|
| `npm ci` | 0 | PASS | dependencies installed |
| `npm run lint` | 0 | PASS | ESLint clean |
| `npm run typecheck` | 1 | FAIL (local only) | 24 `TS2307` errors, **all** inside `.next/` (stale Next.js build artifacts referencing `route.js` instead of `route.ts`). Not a source defect; not reproducible on a clean checkout where `.next/` is absent. Classification: Environment limitation. |
| `npm run test:scan` | 0 | PASS | zero secrets |
| `npm run test:unit` | 0 | PASS | 11/11 |
| `npm run test:integration` | 0 | PASS | 7/7 |
| `npm run test:security` | 0 | PASS | 12/12 |
| `npm run test:financial` | 0 | PASS | 54/54 |
| `npm run test:master` | 0 | PASS | 187 passed, 0 failed |
| `npm run test:financial-stress` | 0 | PASS | all stress scenarios pass |
| `npm run test:durability` | 0 | PASS | 27/27 SQLite durability |
| `npm run test:pilot-security` | 0 | PASS | 28/28 |
| `npm run build` | 0 | PASS | Next.js production build OK |

### Branch `high-008-baseline` — confirmed failures
| Command | Exit | Status | Classification | Error summary |
|---------|------|--------|----------------|---------------|
| `npm ci` | 0 | PASS | — | dependencies installed |
| `npm run lint` | 1 | FAIL | Lint | 5 errors across 4 scripts |
| `npm run typecheck` | 0 | PASS | — | `next typegen && tsc --noEmit` OK (script differs from main) |
| `npm run test:scan` | 0 | PASS | — | zero secrets; server-only boundary clean |
| `npm run test:unit` | 0 | PASS | — | 11/11 |
| `npm run test:integration` | 0 | PASS | — | 7/7 |
| `npm run test:security` | 0 | PASS | — | 12/12 |
| `npm run test:financial` | 1 | FAIL | Financial correctness | 2 failures: Idempotency 10c (replay) & 10e (conflict) |
| `npm run test:master` | 1 | FAIL | Database durability / Financial correctness | Section 8: O2C Core E2E crashed — `UNIQUE constraint failed: audit_events.id` |
| `npm run test:financial-stress` | 1 | FAIL | Financial correctness / Database durability | `UNIQUE constraint failed: audit_events.id` at `appendAuditEvent` |
| `npm run test:durability` | 1 | FAIL | Database durability | `UNIQUE constraint failed: audit_events.id` during `updateApprovalRequest` → `appendAuditEvent` |
| `npm run test:pilot-security` | 0 | PASS | — | 28/28 |
| `npm run build` | 0 | PASS | — | Next.js production build OK |

---

## 5. Actual error messages

### Lint (`high-008-baseline`, exit 1)
```
> eslint

/home/.../scripts/remaining-namespaces-recovery.mjs
  398:22  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports

/home/.../scripts/sqlite-backup.mjs
  909:0  error  Parsing error: '}' expected

/home/.../scripts/test-high-010a-audit-coverage.mjs
   97:14  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports
  117:19  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports

/home/.../scripts/test-session-security.mjs
  13:125  error  Parsing error: ')' expected

✖ 5 problems (5 errors, 0 warnings)
```

### `UNIQUE constraint failed: audit_events.id` (`high-008-baseline`, shared root cause)
```
🚨 Financial Stress Test Suite error: Error: UNIQUE constraint failed: audit_events.id
    at appendAuditEvent (/.../src/lib/db/governance-repository.ts:377:6)
    at <anonymous> (/.../src/lib/db/governance-repository.ts:141:5)
    at withWriteTransaction (/.../src/lib/db/durable-repository.ts:107:14)
    at updateApprovalRequest (/.../src/lib/db/governance-repository.ts:119:3)
    at <anonymous> (/.../src/lib/approvals/store.ts:383:5)
    at <anonymous> (/.../src/lib/approvals/store.ts:121:16)
  code: 'ERR_SQLITE_ERROR',
  errcode: 1555,
  errstr: 'constraint failed'
```

Same stack appears in `test:durability` (during `updateApprovalRequest`) and `test:master` (O2C Core E2E, Section 8), where it aborts the whole master suite (`MASTER TEST SUITE SUMMARY: 160 PASSED, 1 FAILED`).

`test:financial` (2 failures) — Idempotency 10c "Same key + same fingerprint → replay" and 10e "Same key + different fingerprint → conflict" fail under the same shared `audit_events` write path.

---

## 6. Root cause analysis

### Root cause R1 — Confirmed defect: `audit_events.id` UNIQUE constraint violation (high-008-baseline only)

**Location:** `src/lib/db/governance-repository.ts:370-392` (`appendAuditEvent`) and `src/lib/db/governance-schema.ts:149-150` (`id TEXT PRIMARY KEY`).

**Mechanism:** `appendAuditEvent` performs an `INSERT INTO audit_events(id, ...)` using caller-supplied `String(record.id)`. The table declares `id TEXT PRIMARY KEY`, so any duplicate `id` aborts with SQLite `UNIQUE constraint failed: audit_events.id` (errcode 1555). The governance/durable repository layer (new in `high-008-baseline`) reuses or regenerates audit-event ids across concurrent/repeated financial operations (allocation, approval update, payment matching), causing the collision.

**Impacted suites (high-008-baseline):**
- `test:master` — Section 8 O2C Core E2E crashes; whole suite reports 1 failure.
- `test:financial-stress` — concurrent payment matching hits the constraint.
- `test:durability` — `updateApprovalRequest` → `appendAuditEvent` aborts mid-write.
- `test:financial` — idempotency replay/conflict cases (10c, 10e) fail.

**Branch origin:** `src/lib/db/governance-repository.ts`, `governance-schema.ts`, `durable-repository.ts` and related operational/relational repository files are **added/modified only in `high-008-baseline`** (present in the `main` → `high-008-baseline` diff). `main` passes all these suites → **regression introduced by `high-008-baseline`.**

**Classification:** Confirmed defect. Database durability / Financial correctness.

### Root cause R2 — Confirmed defect: Lint errors in new/changed scripts (high-008-baseline only)

**Location:** `scripts/remaining-namespaces-recovery.mjs:398`, `scripts/sqlite-backup.mjs:909`, `scripts/test-high-010a-audit-coverage.mjs:97/117`, `scripts/test-session-security.mjs:13` — all files added or modified in `high-008-baseline`.

**Mechanism:** `@typescript-eslint/no-require-imports` forbids `require()`-style imports in ESM `.mjs` files; two files have syntax/parsing errors (`'}' expected`, `')' expected`).

**Classification:** Confirmed defect. Lint. Introduced by `high-008-baseline` (lint passes on `main`).

### Root cause R3 — Environment limitation: local typecheck noise on `main`

**Location:** `.next/dev/types/validator.ts`, `.next/types/*` (24 `TS2307` errors referencing `route.js`).

**Mechanism:** A stale `.next/` directory from a prior local `next dev` run contains generated type declarations that reference `.js` module extensions. `tsc --noEmit` picks them up and reports `Cannot find module ...route.js`. This is **not** source code; on a clean CI checkout `.next/` does not exist before typecheck, so the error does not occur in CI. `high-008-baseline` typecheck script is `next typegen && tsc --noEmit` (regenerates types first) and passes.

**Classification:** Environment limitation. Not a source defect. Not reproducible in clean CI.

---

## 7. Reproduction results

Environment: Node `v26.7.0`, npm `11.19.0`, isolated `/tmp/*.sqlite` DB paths, no existing user data modified, no source/dependency/workflow changes. Full logs captured in `/tmp/*_main.log` and `/tmp/*_high.log`.

| Command | main | high-008-baseline | Reproducible? | Classification |
|---------|------|-------------------|---------------|----------------|
| `npm ci` | PASS | PASS | Yes | — |
| `npm run lint` | PASS | FAIL (5 errors) | Yes | Lint defect (high) |
| `npm run typecheck` | FAIL (local `.next/` noise) | PASS | main: only with stale `.next/` | Environment limitation |
| `npm run test:scan` | PASS | PASS | Yes | — |
| `npm run test:unit` | PASS | PASS | Yes | — |
| `npm run test:integration` | PASS | PASS | Yes | — |
| `npm run test:security` | PASS | PASS | Yes | — |
| `npm run test:financial` | PASS | FAIL (2: 10c, 10e) | Yes | Financial correctness / DB (high) |
| `npm run test:master` | PASS (187) | FAIL (1: O2C E2E) | Yes | DB durability / Financial (high) |
| `npm run test:financial-stress` | PASS | FAIL | Yes | Financial correctness / DB durability (high) |
| `npm run test:durability` | PASS (27) | FAIL | Yes | DB durability (high) |
| `npm run test:pilot-security` | PASS (28) | PASS (28) | Yes | — |
| `npm run build` | PASS | PASS | Yes | — |

---

## 8. Branch comparison

| Question | Answer |
|----------|--------|
| Failures on both branches? | No confirmed failures are shared. `main` has no confirmed defect (local typecheck noise is environmental). |
| Failures introduced by `high-008-baseline`? | Yes: lint (5), `test:financial` (2), `test:master` O2C E2E (1), `test:financial-stress` (1), `test:durability` (1). All trace to R1 (audit_events UNIQUE) or R2 (lint in new scripts). |
| Failures fixed by `high-008-baseline`? | None. `main` had no real failures to fix. |
| Tests missing from the workflow? | Yes: `test:financial-stress`, `test:durability`, `test:pilot-security` exist in `package.json` but are **not** workflow gates. `high-008-baseline`'s financial-stress and durability failures would not be caught by CI. |
| Does the workflow test the merged PR result? | No. Triggers are `push`/`pull_request` to `main` only; CI runs on the PR head ref, not the merge result, and there is no `merge_group` trigger. `high-008-baseline` is not covered at all. |

**Tests present in package.json but absent from `.github/workflows/ci-cd.yml`:**
`test:financial-stress`, `test:durability`, `test:pilot-security`, `test:financial` (covered only indirectly via `test:master`), plus all domain suites (`test:auth`, `test:tenant`, `test:billing`, …). The workflow relies on `test:master` as an aggregate, but `test:master` aborts on first section crash, masking individual suite results.

---

## 9. Prioritized remediation recommendations

### P1 — Fix `audit_events.id` UNIQUE constraint (confirmed defect, R1)
Ensure audit-event ids are globally unique before insert, or change the schema/write path to tolerate reuse.
- Options: (a) generate id server-side with `crypto.randomUUID()`/ULID inside `appendAuditEvent` when not supplied; (b) make `id` non-PRIMARY-KEY with a separate auto-increment rowid and add a unique business-key index; (c) use `INSERT OR IGNORE`/`ON CONFLICT` idempotent insert.
- Target files: `src/lib/db/governance-repository.ts:370-392`, `src/lib/db/governance-schema.ts:149-150`, callers in `src/lib/approvals/store.ts` and financial allocation paths.
- Verification: `test:durability`, `test:financial-stress`, `test:master`, `test:financial` all green on `high-008-baseline`.

### P2 — Fix lint errors in new scripts (confirmed defect, R2)
- Replace `require()` with static `import` in ESM `.mjs` files; fix syntax errors in `sqlite-backup.mjs:909` and `test-session-security.mjs:13`.
- Verification: `npm run lint` exit 0 on `high-008-baseline`.

### P3 — Workflow configuration (confirmed gap)
- Add `high-008-baseline` to `push`/`pull_request` branch filters (or a `merge_group`) so the development candidate is gated by CI.
- Add `test:financial-stress`, `test:durability`, `test:pilot-security` as explicit workflow gates (they currently fail silently in CI).
- Add `merge_group` trigger so the merged PR result (PR + main) is tested, not just the PR head.
- Pin `actions/checkout`/`setup-node` versions already done (`v4`); Node `22` aligns with `engines`.

### P4 — Local typecheck noise (environment limitation, R3)
- No code change needed. Ensure CI checkouts are clean (no `.next/` committed). `.gitignore` should exclude `.next/` (confirm). Not a defect.

### Not addressed (out of scope / not failing)
`test:external` (Gate 12) requires secrets (`AIOSPARK_DEPLOYMENT_URL`, Zoho, Resend) and is conditionally skipped; not reproducible locally without credentials. Not a current failure.

---

## 10. Verification criteria

Remediation is complete when, on `high-008-baseline`, all of the following return exit 0 with no source/dependency/workflow modifications beyond the remediation itself:

1. `npm ci` — PASS
2. `npm run lint` — PASS (0 errors)
3. `npm run typecheck` — PASS
4. `npm run test:scan` — PASS
5. `npm run test:unit` — PASS
6. `npm run test:integration` — PASS
7. `npm run test:security` — PASS
8. `npm run test:financial` — PASS (54/54, incl. 10c/10e)
9. `npm run test:master` — PASS (0 failed; O2C E2E completes)
10. `npm run test:financial-stress` — PASS
11. `npm run test:durability` — PASS (27/27)
12. `npm run test:pilot-security` — PASS (28/28)
13. `npm run build` — PASS
14. `.github/workflows/ci-cd.yml` updated to include `high-008-baseline` in triggers and `test:financial-stress`/`test:durability`/`test:pilot-security` as gates; `merge_group` added for merged-PR testing.

---

## Finding classification summary

| ID | Finding | Branch | Status | Classification |
|----|---------|--------|--------|----------------|
| R1 | `UNIQUE constraint failed: audit_events.id` in `appendAuditEvent` | high-008-baseline | Confirmed defect | Database durability / Financial correctness |
| R2 | Lint errors in 4 new/changed scripts | high-008-baseline | Confirmed defect | Lint |
| R3 | Local typecheck `TS2307` in `.next/` artifacts | main (local only) | Not reproducible in CI | Environment limitation |
| W1 | `high-008-baseline` excluded from workflow triggers | both | Confirmed gap | Workflow configuration |
| W2 | `test:financial-stress`/`test:durability`/`test:pilot-security` absent from workflow gates | both | Confirmed gap | Workflow configuration |
| W3 | No `merge_group`; merged PR result not tested | both | Confirmed gap | Workflow configuration |

No application source code, package dependencies, or workflow files were modified during this investigation. Both branch workflows have been investigated; every accessible failure has a documented root cause (R1/R2) or explicit unresolved/environment status (R3).
