# AIOSpark Git Reproducibility Report — Iteration 6

## Executive Summary

This report investigates whether a fresh repository checkout can reproduce the current tested application state. The investigation covers the Git root, index, ignore rules, repository history, and required source files.

## Git State Investigation

### Root and Index
- **Git root**: `/home/subham/AIOSpark/AR-automation-revenue`
- **Current branch**: `main`
- **Working tree status**: Modified files present, untracked files present

### Tracked vs Untracked Files

#### Tracked Files (in Git Index)
- `.gitignore`
- `eslint.config.mjs`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`

**Total tracked files**: 8 file patterns

#### Untracked Files
- `.env.example`
- `.github/`
- `.nvmrc`
- `.playwright-mcp/`
- All `AIOSPARK_*.md` reports
- `AIOSPARK_AUTHORITATIVE_TEST_INVENTORY.md`
- ` DESIGN.md`, `PRODUCT.md`
- `scripts/` directory
- `src/app/admin/`, `src/app/agents/`, etc. (all `src/app/*` directories)
- `src/components/`, `src/lib/`, `src/types/`
- `src/proxy.ts`
- `test-fixtures/`
- `stage_drawer_live.png`, `causal_graph.png`, and many PNG images
- `cfo.png`, `dashboard.png`, and many more UI screenshots
- `receivables.png`, `taxonomy.png`, etc.

**Critical finding**: `src/lib/` directory is **NOT tracked** in Git

### Ignore Rules
- `.gitignore` exists at root
- Ignores: `/node_modules`, `/ .pnp`, `/coverage`, `/ .next`, `/ out`
- Does NOT ignore `src/lib/` or any source code directories

### Repository History
- No specific history checked, but the project appears to be a fresh setup
- The `src/lib/` files are "preserved from original setup (untracked, not ignored)" per earlier iteration notes
- No `.git` history for the `src/lib/` source files

## Required Source Files Not Tracked

### Critical Non-Tracked Source Files

The following source directories/files are required to build and run AIOSpark but are **not tracked** in Git:

```
src/lib/                                          ← NOT TRACKED
├── udm/
├── execution/
├── approvals/
├── dashboard/
├── agents/
├── cfo/
├── import/
├── intelligence/
├── taxonomy/
├── tenant/
├── billing/
├── promises/
├── reconciliation/
├── reports/
├── taxation/
├── audit/
├── observability/
├── agents/
├── integration/
├── udm/types.ts
├── execution/service.ts
├── execution/store.ts
├── approvals/store.ts
├── dashboard/engine.ts
└── ... (numerous other files)
```

### Build Dependencies
- `node_modules/` - installed dependencies (not tracked, generated from `package.json`)
- `package.json` and `package-lock.json` - tracked, defines build dependencies
- Next.js framework (`next dev`, `next build`)
- TypeScript compiler (`tsc`)
- ESLint (`eslint`)

### Release Risk Assessment

**If these files are missing from a normal checkout:**

1. **Complete application failure**: A fresh `git checkout` would contain only the tracked files (`.gitignore`, `package.json`, `next.config.ts`, `src/app/` pages). The core business logic in `src/lib/` would be missing.

2. **Build failure**: `npm install` would succeed, but the TypeScript compiler would fail because `src/lib/` files don't exist.

3. **No functional application**: Even if the build somehow succeeded, the application would have no:
   - Execution service
   - UDM data model
   - Approval workflow
   - Dashboard metrics
   - Any backend logic

4. **Test suite incompleteness**: `npm run test:master` would fail because the 160 master tests reference `src/lib/` modules that don't exist.

5. **Critical path broken**: The Order-to-Cash workflow (invoices → payments → reconciliation → reports) is implemented in `src/lib/` and would be completely absent.

## Reproducibility Verdict

**A fresh repository checkout CANNOT reproduce the current tested application.**

**Release risk**: **HIGH** - The source code in `src/lib/` is essential for the application to function, but is not tracked in Git's index. This means:

- Any deployment or checkout outside the current working directory would lose all core functionality
- The application cannot be reproduced from Git alone
- Additional mechanisms are needed to preserve the `src/lib/` source files

### Recommendation

The `src/lib/` source files should be either:

1. **Added to Git tracking** (if intentional to keep them external to version control), or
2. **Documented as a deployment dependency** that must be provided separately, or
3. **Included in the project's deployment artifacts** (Docker image, npm package, etc.)

**Until this is resolved, the application is not fully reproducible from Git.**

## Preserved Changes

The following modifications have been made to the working tree during this iteration and should be preserved:

- `src/lib/testing/__tests__/execution-verification-phase4.test.ts` - Enhanced idempotency test (18/14 → 18 tests)
- `AIOSPARK_PRODUCT_TEST_COVERAGE.md` - Updated test coverage report
- `AIOSPARK_CONTINUOUS_QUALITY_REPORT.md` - Updated with Phase 4 fix
- `AIOSPARK_DEFECT_REPAIR_LEDGER.md` - Documented Defect D11
- `AIOSPARK_FINANCIAL_INTEGRITY_REPORT.md` - Updated Known Issues
- `AIOSPARK_AUTHORITATIVE_TEST_INVENTORY.md` - New authoritative inventory
- `AIOSPARK_AUTHORITATIVE_TEST_INVENTORY.md` - New test inventory file
- `scripts/stress-test-financial.mjs` - Stress test harness (blocked by import resolution)
- Various report files updated with iteration 5/6 evidence