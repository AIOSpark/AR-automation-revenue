# AIOSpark — Git Source Inclusion Proposal — Iteration 15.5 (Validated)

**Repository root**: `/home/subham/AIOSpark/AR-automation-revenue`
**Audit basis**: `git rev-parse --show-toplevel`, `git ls-files --others --exclude-standard`, `git status --short --untracked-files=all`
**Constraint**: Inventory-only. No source modified. No Git state changed. Clean-checkout reproducibility NOT claimed.

---

## 1. Executive summary

| Metric | Value |
|---|---|
| Total unique untracked regular files | 878 |
| Recommended core inclusion (Set A + Set B) | 413 |
| Set A — Production reproducibility | 281 |
| Set B — Verification + regression | 132 |
| Set C — Supporting content (optional) | 118 |
| Not recommended | 347 |
| Repo-maintenance config files (subset of C) | 3 |
| Set A + Set B + repo-maintenance | 416 |
| Grand total | 878 ✅ |

Sets A, B, C are **disjoint** — each untracked file belongs to exactly one set.

**Correction from Iteration 15.4**: `src/proxy.ts` is a recognized Next.js 16.3.4 proxy/middleware entry point (verified against installed framework source). It is moved from development-fixture exclusion into Set A. Set A increases from 280 to 281; root fixtures decrease from 17 to 16; excluded decreases from 348 to 347; core inclusion increases from 412 to 413.

---

## 2. Recommended inclusion list — file-by-file (413 files = Set A + Set B)

### Set A — Production reproducibility (281 untracked files)

Necessary to build and run AIOSpark from source. Together with the 9 tracked modified config files (already in Git), this is the minimum source snapshot.

**Runtime assets (2) — required by production pages:**
```
public/logo.png
public/logo-lockup.png
```
Both are referenced by production pages/components (`verify-email`, `login`, `onboarding`, `forgot-password`, `signup`, `settings/billing`, `settings/notifications`, `MainNavShell`, `LandingNavbar`, `LandingFooter`). Not optional.

**SQL schemas and migrations (10):**
```
src/lib/adapters/schema-integrations.sql
src/lib/auth/schema.sql
src/lib/dashboard/schema-dashboard.sql
src/lib/exceptions/schema-exceptions.sql
src/lib/import/schema-import.sql
src/lib/onboarding/schema-onboarding.sql
src/lib/receivables/schema-receivables.sql
src/lib/taxonomy/schema-taxonomy.sql
src/lib/tenant/schema-rls.sql
src/lib/udm/schema-universal.sql
```
(`src/lib/db/schema.ts` and `src/lib/db/security-migrations.ts` are `.ts` schema modules counted in production source.)

**Production TypeScript source (269):** All `.ts`/`.tsx` under `src/` except test files and fixtures. Includes `src/proxy.ts` (recognized Next.js proxy/middleware entry point). Full list in `manifest_153.json` / `AIOSPARK_SOURCE_CONTROL_MANIFEST.md`.

> `src/proxy.ts` is INCLUDED in Set A: Next.js 16.3.4 recognizes `src/proxy.ts` as a proxy/middleware entry point (`isMiddlewareFilename("src/proxy")` → true). It exports `proxy(request)` with valid `config.matcher = '/api/:path*'` and implements CSRF validation on API routes. It is typechecked by `tsconfig.json` and active at runtime.

### Set B — Verification + regression reproducibility (132 untracked files)

Additional to Set A. Includes both official verification dependencies and standalone regression tests.

**Sub-class 1 — Official verification dependencies (44 files):** Required for `npm run verify` (= lint + typecheck + test:scan + test:master + test:financial-stress).

Verify scripts (3):
```
scripts/security-scan.mjs
scripts/test-master.mjs
scripts/test-financial-stress.mjs
```

Verify test-only source (41): All test files imported by `src/lib/master.test.ts` and `src/lib/testing/__tests__/financial-stress.test.ts` (full list in `manifest_153.json`).

**Sub-class 2 — Additional standalone regression tests (88 files):** Remaining test-only source files and test scripts not imported by the verify chain.

**Test-fixture data (5)** — Category 4 test data:
```
test-fixtures/pilot/customers.csv
test-fixtures/pilot/exceptions.csv
test-fixtures/pilot/invoices.csv
test-fixtures/pilot/payments.csv
test-fixtures/pilot/pilot_master.xlsx
```

**Root-level development fixtures (16) — NOT in Set B:** Unused development experiments (`test-add1.ts`–`test-add6.ts`, `test-explicit-type.ts`, `test-export.ts`, `test-findindex.ts`, `test-function.ts`, `test-minimal.ts`, `test-minimal2.ts`, `test-no-annot.ts`, `test-simple-guard.ts`, `test-top-level.ts`, `test-types-temp.ts` — 16 files, since `src/proxy.ts` moved to Set A). Excluded with evidence.

### Set C — Supporting content (118 untracked files — optional)

Not required for clean-checkout reproducibility or verification. Omission leaves the application fully buildable and runnable.

**Documentation (68):** All untracked `.md` files.
**Non-runtime assets (47):** Root-level `.png` files (documentation/evidence only).
**Environment-specific (2):** `.env.example` (placeholders only, no credentials), `.nvmrc` (Node 22 runtime).
**CI configuration (1):** `.github/workflows/ci-cd.yml` — handwritten CI workflow needed for automated validation.

### Not recommended (347 untracked files)

- Generated or temporary: 331 (`.playwright-mcp/` traces/logs/screenshots 320, `scripts/evaluation-reports/*.json` 11)
- Root-level development fixtures: 16 (unused experiments, `src/proxy.ts` excluded)

---

## 3. Category totals (mutually exclusive; sum = 878)

| # | Primary category | Count | Set |
|---|---|---|---|
| 1 | Production source | 269 | A |
| 2 | SQL schemas and migrations | 10 | A |
| 3 | Test-only source | 71 | B |
| 4 | Test scripts and harnesses | 61 | B |
| 5 | Documentation | 68 | C |
| 6 | Assets | 49 | A (2 runtime) / C (47 docs) |
| 7 | Root-level development fixtures | 16 | — |
| 8 | Generated or temporary files | 331 | — |
| 9 | Environment-specific files | 2 | C |
| 10 | Other | 1 | C (`.github/workflows/ci-cd.yml`) |
| | **Grand total** | **878** | ✅ |

---

## 4. Reconciliation of historical figures

| Reported figure (Iteration 15.1–15.4) | Reconciled value (15.5) | Explanation |
|---|---|---|
| 268 production source | 269 | +1 (`src/proxy.ts` recognized as Next.js proxy entry point) |
| 10 SQL schemas | 10 | Matches ✅ |
| 71 test-only source | 71 | Matches ✅ |
| 61 test scripts/harnesses | 61 | Matches ✅ |
| 68 documentation | 68 | Matches ✅ |
| 49 assets | 49 | Matches ✅ |
| 17 root fixtures | 16 | -1 (`src/proxy.ts` moved to production source) |
| 332 generated/temp | 331 | ci-cd.yml moved to Other → Set C |
| 2 environment-specific | 2 | Matches ✅ |
| 1 Other | 1 | ci-cd.yml classified as Other → Set C |
| Set A + Set B | 413 | Corrected from 412 (+`src/proxy.ts`) |
| Set A + Set B + repo-maintenance | 416 | 413 + 3 |
| Grand total | 878 | ✅ |

---

## 5. Security review (Sets A and B candidates)

- **Production import evidence**: All 269 production source files are required by the application or recognized by Next.js framework discovery, including `src/proxy.ts` (framework-discovered middleware).
- **SQL initialization dependency**: All 10 `.sql` schemas required for DB init / RLS.
- **Test dependency**: All 71 test-only source files import production source; 41 are official verify dependencies.
- **Runtime asset dependency**: `public/logo.png` and `public/logo-lockup.png` required by production pages.
- **Secret-scan outcome**: Official scanner = 0 secrets. Extended scan across 529 inclusion candidates = 0 verified secrets; all pattern hits classified as safe placeholder / false positive / safe test data.
- **Generated or handwritten**: Sets A and B are handwritten source.
- **Duplicate or unused**: No duplicate paths. `src/proxy.ts` is active (not unused); remaining 16 root fixtures are unused experiments.

Excluded per constraints: `.env.local`, `.freebuff/`, credentials, local databases, temporary build artifacts.

---

## 6. Remaining uncertainties

1. Exact 64 file paths of Iteration 12 proposal not preserved; only category counts survive.
2. Extended security scan covered inclusion candidates; some areas scanned with broader patterns only.
3. Import-graph "unused" status not verified via full build (clean-checkout reproducibility not claimed).
4. `.gitignore` modified (unstaged); ignore rules reflect working tree.
5. `AGENTS.md`, `CLAUDE.md` tracked; excluded from untracked inventory.

---

*Proposal finalized: Iteration 15.5. Every untracked file accounted for exactly once; category totals reconcile to 878; production and testing source sets clearly distinguished. `src/proxy.ts` confirmed as a recognized Next.js proxy entry point and included in Set A. Recommended inclusion = 413 untracked files (Set A + Set B). No `git add`/`commit`/`push` performed.*
