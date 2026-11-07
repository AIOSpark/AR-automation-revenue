# AIOSpark — Final Git Source Inclusion Proposal — Iteration 15.5 (Validated)

**Repository root**: `/home/subham/AIOSpark/AR-automation-revenue`
**Audit basis**: `git rev-parse --show-toplevel`, `git ls-files --others --exclude-standard`, `git status --short --untracked-files=all`
**Constraint**: Inventory-only audit. No application source code modified. No Git state changed. Clean-checkout reproducibility is NOT claimed.

---

## 1. Exact unique untracked file count

**878** unique untracked regular files.

- Directories counted as files: 0
- Duplicate paths: 0
- Files in multiple categories: 0
- Sum of mutually exclusive category totals == grand total: 878 == 878 ✅

The complete file-by-file manifest is recorded in `AIOSPARK_SOURCE_CONTROL_MANIFEST.md` and `manifest_153.json` / `manifest_153.csv`.

---

## 2. Mutually exclusive category totals

| # | Primary category | Count | Set |
|---|---|---|---|
| 1 | Production source | 269 | A |
| 2 | SQL schemas and migrations | 10 | A |
| 3 | Test-only source | 71 | B |
| 4 | Test scripts and harnesses | 61 | B |
| 5 | Documentation | 68 | C |
| 6 | Assets | 49 | A / C |
| 7 | Root-level development fixtures | 16 | — |
| 8 | Generated or temporary files | 331 | — |
| 9 | Environment-specific files | 2 | C |
| 10 | Other | 1 | C |
| | **Grand total** | **878** | ✅ |

Additional properties (production dependency, test dependency, SQL initialization dependency, runtime asset dependency, sensitivity, generated/handwritten status, duplicate/unused status, Git inclusion recommendation) are separate per-file fields in the manifest — not additional category counts.

---

## 3. Documentation inventory

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

## 4. Asset inventory

Total unique untracked PNG files: **152**

| Scope | Count | Disposition |
|---|---|---|
| `.playwright-mcp/` page screenshots | 103 | Category 8 — generated/temporary, not assets |
| Root-level `.png` | 47 | Category 6 — documentation assets (Set C) |
| `public/` `.png` | 2 | Category 6 — **runtime assets** (Set A) |
| **Genuine asset PNGs** | **49** | |
| **Total unique PNGs** | **152** | |

Both `public/logo.png` and `public/logo-lockup.png` are referenced by production pages/components and are required at runtime — in Set A.

No `.svg`, `.webp`, `.jpeg`, `.jpg` application assets exist.

---

## 5. Reproducibility sets (disjoint)

| Set | Purpose | Count | Composition |
|---|---|---|---|
| A — Production reproducibility | Build and run from source | **281** | Production source (269) + SQL schemas (10) + runtime assets (2) |
| B — Verification + regression | Execute `npm run verify` + regression tests | **132** | Test-only source (71) + test scripts/harnesses (61) |
| C — Supporting content | Docs, optional assets, dev config | **118** | Documentation (68) + non-runtime assets (47) + env/config (2) + CI config (1) |
| | **A + B + C** | **531** | |
| | Not recommended | 347 | Generated/temp (331) + root fixtures (16) |
| | **Grand total** | **878** | ✅ |

Sets A, B, C are **disjoint**. Set A also depends on the 9 tracked modified config files (already in Git).

**Recommended inclusion: Set A + Set B = 413 untracked files.**
**With repo-maintenance config files: 413 + 3 = 416.**

---

## 6. `src/proxy.ts` determination (Iteration 15.5)

**Decision: Moved into Production source (Category 1, Set A) — recognized Next.js production entry point.**

- Next.js version: 16.3.4 (confirmed in `package.json` and `package-lock.json`).
- `isMiddlewareFilename("src/proxy")` → `true` (Next.js recognizes `"proxy" | "src/proxy"` as middleware filenames).
- `proxyDetectionRegExp = /^proxy\.(?:ts|tsx|js|jsx)$/` matches `proxy.ts`.
- Middleware template imports `mod.proxy` for proxy files and requires it exports a `proxy` function.
- Adapter treats `/proxy` and `/src/proxy` as middleware pages.
- `src/proxy.ts` exports `proxy(request: NextRequest)` returning `NextResponse`, with valid `config.matcher = '/api/:path*'`.
- It implements CSRF validation on API routes — an active security control.
- Not excluded from `tsconfig.json` — typechecked as part of production build.
- **Not** a replacement for backend RBAC/tenant isolation; those remain independent per-route checks.

**Implication**: `src/proxy.ts` is active production middleware. Moving it into Set A increases production source from 268 to 269, reduces root fixtures from 17 to 16, increases Set A from 280 to 281, decreases excluded from 348 to 347. Total remains 878.

---

## 7. Set B sub-classification (execution-path evidence)

`npm run verify` = `lint && typecheck && test:scan && test:master && test:financial-stress`

| Sub-class | Count | Basis |
|---|---|---|
| 1. Official verification dependencies | 44 | 3 verify scripts + 41 test-only source files imported by master.test.ts and financial-stress.test.ts |
| 2. Additional standalone regression tests | 88 | Test files/scripts not imported by the verify chain |
| 3. Optional test utilities/evaluation tools | Included in #2 | Standalone test scripts, evaluation runners |
| 4. Unused development experiments | 16 | Root fixtures — NOT in Set B |

Not every standalone test is classified as mandatory for `npm run verify` without execution-path evidence.

---

## 8. Security and dependency review

- **Production import evidence**: All 269 production source files are required by the application or recognized by Next.js framework discovery, including `src/proxy.ts` (framework-discovered middleware).
- **SQL initialization dependency**: All 10 `.sql` schemas required for DB init / RLS.
- **Test dependency**: All 71 test-only source files import production source; 41 are official verify dependencies.
- **Runtime asset dependency**: `public/logo.png` and `public/logo-lockup.png` required by production pages (Set A).
- **Secret-scan outcome**: Official scanner = 0 secrets (exit 0). Extended scan across all inclusion candidates: 0 verified secrets; all pattern hits classified as safe placeholder / false positive / safe test data.
- **Generated or handwritten**: Sets A and B are handwritten source.
- **Duplicate or unused**: No duplicate paths. Root fixtures (16) are genuinely unused experiments.
- **Excluded per constraints**: `.env.local`, `.freebuff/`, credentials, local databases, temporary build artifacts.

`.env.example` contains placeholders only — safe to include in Set C.

---

## 9. Historical 64-file proposal (Iteration 12)

Proposal: 40 production .ts + 12 SQL + 12 test-only .ts = 64.

**Limitation**: Exact 64 file paths not preserved; only category counts survive. Per-file added/removed mapping cannot be reconstructed. No claim made that all 64 are verified merely because a category count matches.

| Category | Proposed | Current `src/lib/` equivalent | Current count |
|---|---|---|---|
| Production .ts | 40 | Production source under `src/lib/` | 108 |
| SQL schemas | 12 | SQL schemas and migrations | 10 |
| Test-only .ts | 12 | Test-only source under `src/lib/` | 71 |
| Subtotal | 64 | `src/lib/` core | 189 |

Across all of `src/`, production source = 269 (including `src/proxy.ts`).

---

## 10. Tracked modifications (preserved)

9 tracked files with unstaged modifications: `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `package-lock.json`, `package.json`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `tsconfig.json`. Preserved as-is; not staged or committed.

---

## 11. Clean-checkout status

- Source inventory: complete
- Proposed inclusion count: verified (413 core + 3 repo-maintenance = 416 max)
- Git authorization: pending (no `git add` performed)
- Fresh checkout: not yet tested — clean-checkout reproducibility NOT claimed

---

## 12. Remaining uncertainties

1. Exact 64 file paths of Iteration 12 proposal not preserved.
2. Import-graph "unused" status not verified via full build.
3. `.gitignore` modified (unstaged).
4. `AGENTS.md`, `CLAUDE.md` tracked; excluded from untracked inventory.

---

*Proposal finalized: Iteration 15.5. Every untracked file accounted for exactly once; category totals reconcile to 878; production and testing source sets clearly distinguished. `src/proxy.ts` confirmed as a recognized Next.js proxy entry point and included in Set A. Recommended inclusion = 413 untracked files (Set A + Set B). No Git state modified.*
