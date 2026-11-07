# AIOSpark — Source Control Manifest — Iteration 15.5 (Validated)

**Repository root**: `/home/subham/AIOSpark/AR-automation-revenue`
**Audit basis**: `git rev-parse --show-toplevel`, `git ls-files --others --exclude-standard`, `git status --short --untracked-files=all`
**Constraint**: Inventory-only audit. No application source code modified. No Git state changed. No `git add`/`commit`/`push`/`reset`/`clean`/destructive checkout used. All existing modifications and untracked files preserved.

---

## 1. Exact untracked file inventory

| Metric | Value |
|---|---|
| Total unique untracked regular files | **878** |
| Directories counted as files | 0 |
| Duplicate paths | 0 |
| Files appearing in multiple categories | 0 |
| Category sums == grand total | 878 == 878 ✅ |

Every untracked file is captured exactly once as a unique repository-relative path. The full file-by-file manifest is in `AIOSPARK_SOURCE_CONTROL_MANIFEST.md` and machine-readable `manifest_153.json` / `manifest_153.csv`.

---

## 2. Mutually exclusive primary categories (grand total = 878)

| # | Primary category | Count | Set |
|---|---|---|---|
| 1 | Production source | 269 | A |
| 2 | SQL schemas and migrations | 10 | A |
| 3 | Test-only source | 71 | B |
| 4 | Test scripts and harnesses | 61 | B |
| 5 | Documentation | 68 | C |
| 6 | Assets | 49 | A / C* |
| 7 | Root-level development fixtures | 16 | — |
| 8 | Generated or temporary files | 331 | — |
| 9 | Environment-specific files | 2 | C |
| 10 | Other | 1 | C** |
| | **Grand total** | **878** | ✅ |

\* Assets: `public/logo.png` and `public/logo-lockup.png` are runtime assets referenced by production pages (Set A). The other 47 root-level PNGs are documentation/evidence assets (Set C).
\*\* Other (1): `.github/workflows/ci-cd.yml` — handwritten CI configuration, recommended for Set C as supporting repository automation.

Additional properties (production dependency, test dependency, SQL initialization dependency, runtime asset dependency, sensitivity, generated/handwritten status, duplicate/unused status, Git inclusion recommendation) are tracked as separate per-file fields — **not** additional category counts.

---

## 3. Classification decisions (validated Iteration 15.5)

### 3.1 `src/proxy.ts` — Priority 1 & 2: framework entry-point validation

**Determination: `src/proxy.ts` IS a recognized Next.js production entry point (proxy/middleware convention). It is moved from development-fixture exclusion into Production source (Set A).**

Evidence from the installed Next.js 16.3.4 framework:

1. **`isMiddlewareFilename`** (`node_modules/next/dist/build/utils.js`):
   ```js
   function isMiddlewareFilename(file) {
     return file === _constants.MIDDLEWARE_FILENAME        // "middleware"
         || file === `src/${_constants.MIDDLEWARE_FILENAME}` // "src/middleware"
         || file === _constants.PROXY_FILENAME              // "proxy"
         || file === `src/${_constants.PROXY_FILENAME}`;    // "src/proxy"
   }
   ```
   `isMiddlewareFilename("src/proxy")` → `true`. The file `src/proxy.ts` matches `src/${PROXY_FILENAME}`.

2. **Proxy detection regex** (`node_modules/next/dist/build/index.js`):
   ```js
   const proxyDetectionRegExp = new RegExp(`^${_constants.n}\\.(?:${config.pageExtensions.join('|')})$`);
   ```
   With `PROXY_FILENAME = "proxy"`, this becomes `/^proxy\.(?:ts|tsx|js|jsx)$/`, which matches `proxy.ts`.

3. **Middleware template** (`node_modules/next/dist/build/templates/middleware.js`):
   - For proxy files: `const isProxy = page === 'n' || page === '/n';`
   - `handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default` — imports `mod.proxy`
   - Error: "The Proxy file ... must export a function named `proxy` or a default function."

4. **Adapter** (`node_modules/next/dist/server/web/adapter.js`):
   ```js
   const isMiddleware =
     params.page === '/middleware' ||
     params.page === '/src/middleware' ||
     params.page === '/proxy' ||
     params.page === '/src/proxy'
   ```
   `src/proxy.ts` maps to page `/src/proxy`, which is explicitly treated as middleware.

**File inspection of `src/proxy.ts`:**
- Named export `proxy(request: NextRequest)` — correct function signature for a proxy handler
- Imports `NextResponse`, `NextRequest` from `next/server`
- Imports `isCsrfRequestSafe` from `@/lib/auth/csrf`
- `config.matcher = '/api/:path*'` — valid matcher configuration
- Implements CSRF validation: returns `403` for unsafe non-exempt API requests, `NextResponse.next()` otherwise
- Public route exemption: `/api/billing/razorpay-webhook` is CSRF-exempt
- Protected route coverage: all other `/api/:path*` routes require CSRF-safe requests
- Error handling: returns structured JSON error on CSRF failure

**Effective TypeScript configuration**: `src/proxy.ts` is NOT excluded from `tsconfig.json` (included via `**/*.ts`), so it is typechecked as part of the production build.

**Classification**: Moved from Category 7 (root-level development fixtures) to **Category 1 (Production source)** and into **Set A (Production reproducibility)**. It is an active production middleware entry point recognized by Next.js 16.3.4.

**Security and runtime implications**: `src/proxy.ts` runs CSRF validation on API routes at the edge/middleware layer. It is an active security control for `/api/:path*` routes. However, per Priority 3 review, it must NOT be treated as a replacement for backend RBAC, tenant isolation, or permission validation — those remain independent authorization checks within each API route handler.

### 3.2 Test fixtures — confirmed Category 4

All five files under `test-fixtures/pilot/` belong to exactly one category — **Category 4 (Test scripts and harnesses as test data)**:

| Path | Category | Evidence |
|---|---|---|
| `test-fixtures/pilot/customers.csv` | 4 | Read by `scripts/test-real-import-pilot.ts` |
| `test-fixtures/pilot/exceptions.csv` | 4 | Test data for import pipeline |
| `test-fixtures/pilot/invoices.csv` | 4 | Test data for import pipeline |
| `test-fixtures/pilot/payments.csv` | 4 | Test data for import pipeline |
| `test-fixtures/pilot/pilot_master.xlsx` | 4 | Read by `scripts/test-real-import-pilot.ts` |

Removed from any root-level development fixture listing (Category 7). Every manifest path appears exactly once.

### 3.3 Set B sub-classification — official verify vs standalone

`npm run verify` = `npm run lint && npm run typecheck && npm run test:scan && npm run test:master && npm run test:financial-stress`

| Sub-classification | Count | Basis |
|---|---|---|
| 1. Official verification dependencies | 44 | `scripts/security-scan.mjs` (test:scan), `scripts/test-master.mjs` (test:master), `scripts/test-financial-stress.mjs` (test:financial-stress), plus 41 test-only source files imported by the verify chain via `src/lib/master.test.ts` and `src/lib/testing/__tests__/financial-stress.test.ts` |
| 2. Additional standalone regression tests | 88 | Remaining test-only source files and test scripts not imported by the official verify chain |
| 3. Optional test utilities and evaluation tools | Included in #2 | Standalone test scripts, evaluation runners |
| 4. Unused development experiments | 16 | Root fixtures (Category 7) — NOT in Set B |

**Not all 132 Set B files are required by `npm run verify`.** Only the 44 official verification dependencies have execution-path evidence. The remaining 88 are standalone regression tests, kept separately classified.

### 3.4 Runtime assets — confirmed Set A

| Asset | Referenced by | Runtime required? | Set |
|---|---|---|---|
| `public/logo.png` | `verify-email`, `login`, `onboarding`, `forgot-password`, `signup`, `settings/billing`, `settings/notifications` (7 pages) | **Yes** | A |
| `public/logo-lockup.png` | `MainNavShell` (2x), `LandingNavbar`, `LandingFooter` | **Yes** | A |
| 47 root-level PNGs | Documentation/evidence only | No | C |

Both `public/` PNGs are required by production pages — in Set A.

### 3.5 CI and environment configuration — Set C

| File | Type | Purpose | Set |
|---|---|---|---|
| `.github/workflows/ci-cd.yml` | Handwritten CI workflow | Automated validation & release gate on push/PR to `main` | C |
| `.env.example` | Placeholder config | Template with placeholder values only (`your-...-api-key-here`); **no actual credentials** | C |
| `.nvmrc` | Runtime definition | Specifies Node.js 22 runtime | C |

---

## 4. Documentation inventory

Total unique untracked Markdown files: **68**

| Scope | Count |
|---|---|
| Project-root `.md` | 30 |
| `docs/` `.md` (excl. audits) | 31 |
| `docs/audits/` `.md` | 5 (subset of `docs/` — counted once) |
| `.github/PULL_REQUEST_TEMPLATE.md` | 1 |
| `src/` `.md` | 1 |
| **Unique total** | **68** |

`AGENTS.md` and `CLAUDE.md` are tracked (not untracked).

---

## 5. Asset inventory

Total unique untracked PNG files: **152**

| Scope | Count | Disposition |
|---|---|---|
| `.playwright-mcp/` page screenshots | 103 | Category 8 — generated/temporary, not assets |
| Root-level `.png` | 47 | Category 6 — documentation assets (Set C) |
| `public/` `.png` | 2 | Category 6 — **runtime assets** (Set A) |
| **Genuine asset PNGs** | **49** | |
| **Total unique PNGs** | **152** | |

No `.svg`, `.webp`, `.jpeg`, `.jpg` application assets exist.

---

## 6. Security scan

**Official scanner** (`scripts/security-scan.mjs`, `npm run test:scan`, covers `src/`): **0 hardcoded secrets found (exit 0).**

**Extended scan** across all inclusion candidates: 0 verified secrets; all pattern hits classified as safe placeholder / false positive / safe test data. No actual credentials included.

`.env.example` contains **placeholders only** — safe to include. `.env.local`, `.freebuff/`, local databases (`.data/`), temporary build artifacts excluded.

---

## 7. Tracked modifications (preserved, untouched)

9 tracked files with unstaged modifications (already in Git): `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `package-lock.json`, `package.json`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `tsconfig.json`. Preserved as-is; not staged or committed.

---

## 8. Reproducibility sets (disjoint; sum = 878)

| Set | Purpose | Untracked count | Composition |
|---|---|---|---|
| A — Production reproducibility | Build and run AIOSpark from source | **281** | Production source (269) + SQL schemas (10) + runtime assets (2) |
| B — Verification + regression | Execute `npm run verify` + regression tests | **132** | Test-only source (71) + test scripts/harnesses (61) |
| C — Supporting content | Docs, optional assets, dev config | **118** | Documentation (68) + non-runtime assets (47) + env/config (2) + CI config (1) |
| | **A + B + C** | **531** | |
| | Not recommended | 347 | Generated/temp (331) + root fixtures (16) |
| | **Grand total** | **878** | ✅ |

Sets A, B, C are **disjoint**. Set A also depends on the 9 tracked modified config files (already in Git).

---

## 9. Final inclusion counts (corrected)

| Figure | Value | Notes |
|---|---|---|
| Set A (production reproducibility) | 281 | Includes `src/proxy.ts` |
| Set B (verification + regression) | 132 | |
| **Set A + Set B (core inclusion)** | **413** | Corrected from 412 (Iteration 15.4) — `src/proxy.ts` added |
| Repo-maintenance config files | 3 | `.github/workflows/ci-cd.yml`, `.env.example`, `.nvmrc` |
| **Set A + Set B + repo-maintenance** | **416** | 413 + 3; these 3 are part of Set C (118), already in the 878 grand total |
| Set C (supporting content) | 118 | Includes the 3 repo-maintenance files above |
| Not recommended | 347 | Generated/temp (331) + root fixtures (16) |
| **Grand total** | **878** | ✅ |

**Recommended Git inclusion: Set A + Set B = 413 untracked files.**

Exact file paths for all 413 files are documented in `AIOSPARK_GIT_INCLUSION_PROPOSAL.md`.

---

## 10. Machine-readable manifest

- Full inventory: `manifest_153.json` / `manifest_153.csv`
- Each entry: `path`, `primary category`, `extension`
- Grand total validated: sum of category counts (878) == unique file count (878)

---

## 11. Clean-checkout status

- Source inventory: **complete**
- Proposed inclusion count: **verified (413 core + 3 repo-maintenance = 416 max)**
- Git authorization: **pending** (no `git add` performed)
- Fresh checkout: **not yet tested** — clean-checkout reproducibility is NOT claimed

---

## 12. Remaining uncertainties

1. Exact 64 file paths of Iteration 12 proposal not preserved; only category counts survive.
2. Import-graph "unused" status not verified via full build.
3. `.gitignore` modified (unstaged); ignore rules reflect working tree.
4. `AGENTS.md`, `CLAUDE.md` tracked; excluded from untracked inventory.

---

*Manifest finalized: Iteration 15.5. Every untracked file accounted for exactly once; category totals reconcile to 878; production and testing source sets clearly distinguished. `src/proxy.ts` confirmed as a recognized Next.js proxy entry point and moved to Set A. No Git state modified.*
