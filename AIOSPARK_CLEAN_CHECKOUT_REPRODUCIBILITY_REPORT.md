# AIOSpark Clean-Checkout Reproducibility Report — Iteration 7

## Executive Summary

A clean checkout containing only Git-tracked files **cannot reproduce the AIOSpark application**. The core business logic in `src/lib/` (188 files, all untracked) is absent from the repository index.

## Clean-Checkout Experiment

### Setup
- **Original working directory**: `/home/subham/AIOSpark/AR-automation-revenue`
- **Clean checkout directory**: `/tmp/aiospark-clean`
- **Method**: Copied only files tracked in Git (`git ls-files`), excluding all untracked content
- **Total tracked files**: 28 files at root level + `src/app/` directory

### Results

| Check | Outcome | Details |
|---|---|---|
| `git status` | Tracked only | 28 root-level files + `src/app/` |
| Directory listing | `src/lib/` **absent** | 188 files from original repo missing |
| `npm install` | **Succeeded** | Dependencies installed from `package.json` |
| `npm run lint` | **Passed** | No source code to lint (clean checkout has no `src/lib/`) |
| `npm run typecheck` | **FAILED** | 50+ TypeScript errors, all from missing `src/lib/` modules |
| `npm run verify` | **FAILED** | Verification chain breaks at typecheck |
| Application build | **Cannot build** | `next build` requires `src/lib/` modules |
| Test execution | **Impossible** | All `AIOSPARK_TEST_MODE=true tsx scripts/*.mjs` fail without `src/lib/` |

### TypeScript Errors (clean checkout)
All errors are `TS2307: Cannot find module` or `TS2304: Cannot find name` originating from `src/lib/`:

```
next.config.ts(2,36): error TS2307: Cannot find module './src/lib/security/headers'
src/app/layout.tsx(35,50): error TS2304: Cannot find name 'LayoutProps'
src/app/page.tsx:5,29: error TS2307: Cannot find module '@/components/landing/LandingNavbar'
src/app/page.tsx:6,31: error TS2307: Cannot find module '@/components/landing/LandingHero'
... (50+ total errors)
```

All errors resolve when the original `src/lib/` is present.

### Test Execution Attempt

Attempting to run a single test from clean checkout:

```
cd /tmp/aiospark-clean && AIOSPARK_TEST_MODE=true npx tsx scripts/test-security.mjs
Error: Cannot find module '../src/lib/udm/store' from 'scripts/test-security.mjs'
```

All test scripts fail with the same category of import error: they attempt to import from `../src/lib/...` which does not exist in the clean checkout.

## Root Cause

The `src/lib/` directory contains 188 source files implementing the complete AIOSpark business logic:

- **Execution service** (`execution/service.ts`, `execution/store.ts`)
- **UDM data model** (`udm/store.ts`, `udm/types.ts`)
- **Approval workflow** (`approvals/store.ts`)
- **Dashboard metrics** (`dashboard/engine.ts`)
- **Tenant management** (`tenant/store.ts`)
- **Intelligence/reasoning engine** (`intelligence/reasoning-engine.ts`)
- **Taxonomy system** (`taxonomy/`)
- **Billing/promises/reconciliation** modules
- **All 17+ product module test suites**

Per `git ls-files src/lib/`, **zero files** from `src/lib/` are tracked in the Git index. They exist only in the working directory, presumably "preserved from original setup" as noted in earlier iteration records.

## Reproducibility Verdict

| Metric | Value |
|---|---|
| Clean checkout from Git only | ❌ Fails |
| TypeScript compilation | ❌ 50+ errors (all `src/lib/` missing) |
| Lint pass | ✅ Passes (no code to lint) |
| Verification pipeline | ❌ Breaks at typecheck |
| Master test suite (160 tests) | ❌ Cannot execute |
| Any test suite execution | ❌ All fail |
| Application runtime | ❌ Cannot start |

**Release risk: CRITICAL** — The application is not reproducible from Git alone. A clean `git clone` or checkout would produce a Next.js app shell with no functional business logic.

## Recommendations

### Option 1: Add `src/lib/` to Git Tracking (Recommended)
All 188 source files in `src/lib/` should be added to Git version control. This is the simplest approach and ensures full reproducibility.

```bash
# From project root
git add src/lib/
git commit -m "chore: add src/lib source files for reproducibility"
```

### Option 2: Document as Deployment Dependency
If `src/lib/` must remain external to Git (e.g., compiled artifact, separate package), then:
- Document the requirement clearly
- Include `src/lib/` in deployment artifacts (Docker image, npm package, etc.)
- Add installation instructions for the missing source

### Option 3: Move to Package/Module
Extract `src/lib/` into a separate npm package with its own versioning and publication cycle. This would allow independent version management but adds infrastructure complexity.

## Required Files for Reproducibility

The following file categories from `src/lib/` are required for the application to function:

| Category | File count | Examples |
|---|---|---|
| Core services | ~30 | `execution/service.ts`, `approvals/store.ts` |
| Data models | ~20 | `udm/store.ts`, `udm/types.ts` |
| Dashboard metrics | ~15 | `dashboard/engine.ts` |
| Tenant/billing | ~15 | `tenant/store.ts`, `billing/` |
| Intelligence/reasoning | ~15 | `intelligence/reasoning-engine.ts` |
| Taxonomy/classification | ~10 | `taxonomy/` |
| Test infrastructure | ~15 | All test suites in `testing/__tests__/` |
| Integrations/imports | ~15 | `import/`, `agents/` |
| Other modules | ~55 | `promises/`, `reconciliation/`, `audit/`, etc. |

**Total: 188 files** required for full application functionality.

## Preservation Actions

The following should be done to ensure future reproducibility:

1. **Add `src/lib/` to Git** — immediate fix for reproducibility
2. **Update `.gitignore`** — ensure `src/lib/` is not inadvertently excluded
3. **Verify clean checkout** — after adding to Git, confirm `npm run verify` passes
4. **Document the change** — record in release notes and onboarding docs
5. **Add CI check** — ensure `src/lib/` files are tracked in CI pipeline

## Related Reports

- `AIOSPARK_GIT_REPRODUCIBILITY_REPORT.md` — High-level Git tracking assessment
- `AIOSPARK_CONTINUOUS_QUALITY_REPORT.md` — Updated with priority status
- `AIOSPARK_DEFECT_REPAIR_LEDGER.md` — Defect D11 documents Phase 4 fix

## Next Steps

1. **Decision point**: Project maintainers must choose Option 1, 2, or 3 above
2. **If Option 1**: Run `git add src/lib/ && git commit -m "chore: add src/lib source files"` then verify clean checkout
3. **If Option 2**: Document `src/lib/` as deployment dependency in onboarding and CI/CD
4. **If Option 3**: Extract to npm package with publication pipeline
5. **After resolution**: Re-run clean-checkout experiment to confirm reproducibility