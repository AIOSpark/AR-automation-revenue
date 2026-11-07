# AIOSpark Release Management, Deployment & Rollback Strategy

## 1. Release Architecture Overview
AIOSpark enforces an automated 11-stage quality pipeline before any code can reach production. The platform rule is strict:

> **IF SECURITY FAILS → DO NOT DEPLOY**  
> **IF FINANCIAL CORRECTNESS FAILS → DO NOT DEPLOY**  
> **IF TENANT ISOLATION FAILS → DO NOT DEPLOY**  
> **IF BUILD FAILS → DO NOT DEPLOY**

---

## 2. CI/CD Quality Gate Pipeline Sequence

```
Developer Change
       │
       ▼
1. Lint (ESLint)
       │
       ▼
2. Typecheck (tsc --noEmit)
       │
       ▼
3. Secret Scan (No hardcoded credentials)
       │
       ▼
4. Unit Tests (Isolated business logic)
       │
       ▼
5. Integration Tests (Adapters, retries, idempotency)
       │
       ▼
6. Security Tests (RLS, RBAC, tenant isolation, mock auth protection, AI prompt safety)
       │
       ▼
7. Financial Golden Tests (Integer arithmetic, allocations, cross-module consistency)
       │
       ▼
8. Master Verification Suite (128/128 tests passing)
       │
       ▼
9. Production Build (Next.js compilation)
       │
       ▼
10. Critical E2E User Journeys (7 end-to-end user workflows)
       │
       ▼
11. Staging / Post-Deployment Health Check & Smoke Verification
```

---

## 3. Deployment Environments & Isolation
1. **Development (`local`)**: Isolated developer environment with mock authentication and seed UDM stores.
2. **Staging (`staging`)**: Isolated pre-production environment connecting to staging database and sandbox API keys. Never connected to real customer financial data.
3. **Production (`production`)**: Protected environment requiring 100% green CI pipeline checks and explicit administrative approval.

---

## 4. Zero-Downtime Deployment & Database Migration Safety
- **Backward Compatibility:** Database schema migrations must be additive (`ADD COLUMN`, `CREATE TABLE`) to allow old and new application containers to run concurrently during deployment.
- **Destructive Change Guard:** `DROP TABLE` or `DROP COLUMN` operations are flagged during CI and require manual two-phase release approval.
- **Precision Integrity:** Monetary amounts are stored in minor unit integers (paise/cents) to prevent floating-point rounding drift.

---

## 5. Rollback Strategy
If post-deployment health checks fail or critical runtime regressions occur:
1. **Application Rollback:** Revert router / container traffic to the previous verified build artifact (`commit SHA`).
2. **Database Migration Safety:** Migrations are designed to be non-breaking to the previous application version, ensuring seamless fallback without database downtime.

---

## 6. Execution Commands
- **Run Full Verification:** `npm run verify` or `npm test`
- **Run Master Test Suite:** `npm run test:master`
- **Run Unit Tests:** `npm run test:unit`
- **Run Integration Tests:** `npm run test:integration`
- **Run Security Tests:** `npm run test:security`
- **Run Financial Golden Tests:** `npm run test:financial`
- **Run E2E User Journeys:** `npm run test:e2e`
- **Run Post-Deployment Smoke Tests:** `npm run test:smoke`
- **Run real staging release gate:** `npm run test:external`
- **Run Production Build:** `npm run build`

## 7. Required Runtime Configuration

The server-side UDM, approvals, integrations, promises, communication, tenant,
alerts, and observability repositories use SQLite through Node's synchronous
database driver. Production must run Node.js 22 or newer and set `AIOSPARK_DB_PATH` to a writable durable
volume or managed SQLite mount. `AIOSPARK_TEST_MODE=true` is reserved for tests
and switches repositories to an isolated in-memory database.

The external release gate is intentionally not considered green until a staging
deployment supplies real Zoho/Tally credentials, a production-like transactional
email provider configuration (`RESEND_API_KEY` and `EMAIL_FROM`), and a
deployment URL that responds successfully to `GET /api/health`. Sandbox fixture
tests do not substitute for that gate.
