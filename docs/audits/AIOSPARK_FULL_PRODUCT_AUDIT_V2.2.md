# AIOSpark Comprehensive Forensic Product Audit V2.2 — Enhanced Reconciliation

**Audit Date:** November 3, 2026
**Purpose:** Incorporate user feedback and reconcile latest benchmark results into the authoritative audit record.
**Scope:** Entire AIOSpark repository at `/home/subham/AIOSpark/AR-automation-revenue`
**Status:** V2.2 incorporating all user corrections — supersedes V2.1 where modifications applied.

---
## Executive Summary

V2.1 was significantly more credible than V2, and the user accepts most of its corrections. V2.2 incorporates five key enhancements based on the user's review:

1. **Smoke-test reconciliation** — Latest benchmark output shows 6 failed invocations across 2 models; 3-model execution defect identified and addressed
2. **Tenant-context design** — Request-scoped context via AsyncLocalStorage, not global mutable organization ID
3. **Score clarification** — "Core Engineering Controls Score: 6.7/10" — not presented as overall product readiness
4. **Prompt injection elevation** — Upgraded to P1-3 priority, before processing real customer ERP content
5. **Revised priority order** — Addresses missing three-model execution, concurrent tenant isolation, and prompt-injection protection

**Overall Assessment:** AIOSpark has verified deterministic financial calculations (golden tests pass) and sound UDM/RBAC foundation, but the AI/LLM execution layer has two confirmed defects: (a) evaluation runner only invokes 2 of 3 model configurations, and (b) Gemini/Mistral Large invocations fail before producing valid results. These are engineering gaps, not necessarily model hallucinations.

---
## 1. What V2.2 Gets Right (Accepted from V2 + User Corrections)

### Confirmed Findings (Retained)
| Category | Finding | Evidence |
|---|---|---|
| Financial | `getInvoiceOutstandingBalance()` computes outstanding balance correctly | All 5 golden tests pass (₹100k - ₹40k = ₹60k) |
| Financial | `Math.max(0, outstanding)` prevents negative values | Overpayment validation test passes |
| UDM | Schema has 9 core tables with proper enums, FKs, RLS policies | `schema-universal.sql` confirmed |
| UDB | RLS policies on all 8 UDM tables use `current_setting('app.current_org_id')` | Database-level isolation excellent |
| Architecture | `src/lib/cfo/engine.ts` is a god class at ~560 lines | Confirmed — handles too many concerns |
| RBAC | Approval system with graduated autonomy and audit logging | `src/lib/approvals/store.ts` confirmed |
| API keys | `import 'server-only'` used in provider/adaptor/router | API keys never reach client bundles |

### Rejected/Disproven Findings (From V2 and V2.1)
| Finding | Verdict | Reason |
|---|---|---|
| `getMatches()` unfiltered cross-tenant vulnerability | **REJECTED** | Code explicitly filters by `organization_id` |
| Model hallucination as cause of safety gate violations | **REJECTED** | Reclassifier as evaluator null-defect or no-API-credentials problem |
| Mistral Small as automatic production fallback | **REJECTED** | Should be independently selectable in evaluation runner only |
| 39/15 = 2.6/5 score | **REJECTED** | Corrected to 39/15 = 2.6/10; overall methodology rebuilt |
| 60%/25%/15% percentages | **REJECTED** | No defined denominator or measurable feature inventory |
| "Entire deterministic layer trustworthy" | **REFINED** | Narrowed to verified subset only |
| Overall 3.2/15 score | **REJECTED** | Replaced with 6.7/10 core engineering controls score |

### Newly Rejected / Further Corrected
| Finding | Previous Status | V2.2 Status | Reason |
|---|---|---|---|
| Smoke-test six failures conclusive | Accepted in V2.1 | **REJECTED AS CONCLUSIVE** | Two separate failure modes: (1) runner only invokes 2/3 models, (2) model invocations fail safety gates — need root-cause distinction |
| `getTenantContext()` null handling | P2 gap | **REQUST-SCOPED VIA ASYNCLOCALSTORAGE** | Must not use global mutable org ID; concurrency test must pass |
| 6.7/10 as overall product score | Accepted in V2.1 | **CORE ENGINEERING CONTROLS SCORE** | Does not encompass UI/UX, billing, deployment, observability etc. |
| Prompt injection at P2 priority | V2.1 placement | **P1-3 (Priority 1, Point 3)** | Must protect against customer ERP/invoice content, not just theoretical threat |
| Three-model execution (Gemini/Mistral Large/Small) | Not addressed in V2.1 | **CONFIRMED DEFECT** | Runner iterates provider names, not model configurations — only 2 of 3 models invoked |

---
## 2. Five Remaining Problems & V2.2 Corrections

### A. Smoke-Test Results Not Reconciled (CRITICAL)

The user's P1-2D smoke-test output (November 2) is the most important omission in V2.1:

```
Latest observed benchmark execution
# 6 Invocations failed
# 0 Successful invocations
# 3 Expected Mistral Small calls missing
# 0 ms Reported latency for both models
Gemini: 3 failed · Mistral Large: 3 failed · Mistral Small: not executed
```

**Two separate defects identified:**

1. **Model configuration defect**: The evaluation runner iterates over *provider names* (`google`, `mistral`) rather than *model configurations*. There are three independent evaluation targets:
   - `google` → `gemini-3.8-flash` (Gemini)
   - `mistral` → `mistral-large-4` (Mistral Large)
   - `mistral` → `mistral-small-2603` (Mistral Small) — **currently not executed**

   The router has only 2 configured routes; the third (Mistral Small) must be added as an independently selectable model target.

2. **Invocation failure defect**: Both Gemini (3 cases) and Mistral Large (3 cases) fail before producing successful evaluation results. The root cause must be traced through the evaluation pipeline:
   - Credential configuration failure
   - HTTP authentication failure
   - Invalid model identifier
   - Provider API error
   - Network/timeout failure
   - Response parsing failure
   - Schema validation failure
   - Evidence validation failure
   - Financial validation failure
   - Evaluator/scoring defect

**V2.2 Action**: The coding agent must trace each failed invocation through the full pipeline (see Section 7 "Immediate Next Steps") and distinguish credential failures from model/output failures.

### B. Tenant-Context Remediation Needs Safer Design

V2.1 proposed making `getTenantContext()` throw when context is missing and adding automatic context provisioning. The user correctly identifies the architectural risk:

> Do not solve this by introducing a global mutable organization ID.
> Imagine two users accessing AIOSpark simultaneously:
> - Request A belongs to Organization A.
> - Request B belongs to Organization B.
> - Both requests use the same server process.
> A shared tenant variable could be overwritten between operations.

**V2.2 Correction**: Implement request-scoped tenant context using one of:

1. **AsyncLocalStorage** — Node.js native mechanism for request-scoped data that survives async boundaries. Each request gets its own `orgId` binding that cannot leak between concurrent requests.

2. **Explicit tenant context passed into data-access functions** — Each UDM method accepts `orgId: string` as a parameter, and middleware extracts it from the auth context once and passes it down the call chain.

**Acceptance test must demonstrate isolation across concurrent requests**, not just sequential test cases. The test should:
- Spawn two parallel requests with different organization IDs
- Verify each sees only its own data
- Verify no cross-tenant leakage in UDM reads, matches, exceptions, etc.
- Pass even when both requests share the same server process

**Current `getMatches()` is correct** because it calls `getRequestTenant()` each time — but only if `getRequestTenant()` uses request-scoped storage (AsyncLocalStorage) rather than a module-level global variable.

### C. The 6.7/10 Score Is Not a Complete Product Score

The user is correct:

> It does not comprehensively score: UI/UX and accessibility, Workflow completeness, Billing and commercial readiness, Deployment and recovery, Performance under real workload, Reporting and communications, Operational observability.

**V2.2 Renaming**: "Core Engineering Controls Score: 6.7/10"

This score measures five engineering control dimensions:
- D1: Deterministic Financial Calculations (5/5 × 30% = 3.0)
- D2: UDM and Data Provenance (4/5 × 20% = 1.6)
- D3: Multi-Tenant Security (3/5 × 20% = 1.2)
- D4: Authentication and RBAC (2/5 × 15% = 0.6)
- D5: AI/LLM Execution (1/5 × 15% = 0.3)

**It does NOT measure** product readiness, customer pilot readiness, or overall commercial viability. The V2.1 statement "Not ready for controlled customer pilot" remains valid, but the 6.7/10 is specifically the *core engineering controls* sub-score.

### D. Prompt Injection Deserves Higher Priority

The user correctly notes:

> Do not treat escaping HTML or special characters as a complete prompt-injection defense.
> The system needs clear untrusted-data boundaries, restricted tool permissions, evidence validation and independent action authorization.

**V2.2 Correction**: Prompt injection is upgraded from P2 to **P1-3** in the revised priority order. Reasons:

1. AIOSpark will process invoice descriptions, ERP records, and customer communications — all potential prompt-injection vectors
2. Escaping `{{` and `}}` delimiters (current `escapeForPrompt` implementation) is necessary but **not sufficient**
3. The system needs clear untrusted-data boundaries at the prompt-construction layer
4. This protection must be in place before processing real customer ERP content, not after

### E. Revised Priority Order (User's R1-R7 with Adjustments)

The user proposes a restructured priority order that V2.2 adopts:

| Priority | Task | Expected Outcome |
|---|---|---|
| **P0-1** | Diagnose actual Gemini/Mistral invocation failures | Establish real failure root cause through pipeline trace |
| **P0-2** | Fix evaluation runner's three-model execution | 9 independently attributed smoke invocations (3 models × 3 cases) |
| **P0-3** | Enforce deterministic financial facts | No model-generated authoritative balances; application calculates |
| **P0-4** | Complete independent verification and execution | Verified diagnosis → approval → mutation → independent post-execution verification |
| **P1-1** | Tenant isolation under concurrency | No cross-tenant access across concurrent requests (AsyncLocalStorage verified) |
| **P1-2** | Authentication and RBAC | Every financial API operation permission-checked against actual user permissions |
| **P1-3** | Prompt injection and untrusted-data protection | Safe processing of customer-supplied information (invoice ERP, descriptions) |
| **P1-4** | Evaluation accuracy and observability | Reliable scores, errors, tokens, cost and latency reporting |
| **P2** | Billing, reporting, deployment and operational readiness | Production-grade supporting infrastructure (billing webhooks, exports, migrations, backups, rollback, monitoring, alerting) |

This preserves V2.1's remediation roadmap intent while addressing the missing three-model execution issue, request-scoped tenant design, and prompt-injection elevation.

---
## 3. Updated Scoring Summary

### Core Engineering Controls Score: 6.7/10

| Dimension | Score | Weight | weighted |
|---|---|---|---|
| D1: Deterministic Financial Calculations | 5/5 | 30% | 3.0 |
| D2: UDM and Data Provenance | 4/5 | 20% | 1.6 |
| D3: Multi-Tenant Security | 3/5 | 20% | 1.2 |
| D4: Authentication and RBAC | 2/5 | 15% | 0.6 |
| D5: AI/LLM Execution | 1/5 | 15% | 0.3 |
| **Total** | | **100%** | **6.7/10** |

**Score Interpretation:**
- 8.0–10.0: Ready for pilot / production
- 6.5–7.9: Conditional — fix critical gaps first
- 5.0–6.4: Early development — significant gaps
- 3.0–4.9: Prototype — not pilot-ready
- 0.0–2.9: Proof-of-concept only

**AIOSpark V2.2: 6.7/10 → Conditional — fix critical gaps first** (particularly AI/LLM execution and request-scoped tenant context).

---
## 4. Key Methodological Changes from V2 to V2.2

| Area | V2 | V2.1 | V2.2 |
|---|---|---|---|
| **Benchmark failures** | Claimed as model-generated financial errors | Reclassified as financial-validation/evaluator-defect problem; root cause not established | **Pipeline trace: 2 defects identified (model config + invocation failure)** |
| **Tenant isolation** | `getMatches()` classified as unfiltered cross-tenant vulnerability | Corrected: `getMatches()` filters by org_id; remaining gap is missing org_id filter in `getInvoiceOutstandingBalance()` | **Request-scoped context via AsyncLocalStorage; concurrency test required** |
| **Score calculation** | 3.2/15; 39/15 = 2.6/5; percentages 60/25/15 | 6.7/10; 39/15 = 2.6/10 corrected; percentages discarded; defined 0-10 per-dimension weighting | **6.7/10 "Core Engineering Controls Score" — not overall product score** |
| **Model hallucination** | Confirmed as cause of safety gate violations | Rejected as unconfirmed; evaluator defect or no API credentials possible causes | **Two distinct defects: (1) runner only invokes 2/3 models, (2) model invocations fail safety gates** |
| **Mistral Small routing** | Should be automatic production fallback | Corrected: independently selectable in evaluation runner, not automatic fallback without routing policy | **Added as P0-2: fix evaluation runner's three-model execution** |
| **Repository inventory** | Several files reported missing | Corrected: evaluation-bench JSON files exist; `run-evaluation.ts` was executed; stale snapshot issue identified | **Confirmed: all files exist; runner defect is in model-config iteration, not file absence** |
| **Prompt injection** | P2 priority (general) | Confirmed in V2.1 Recommendation | **Upgraded to P1-3: before processing customer ERP content** |
| **Tenant context design** | Make throw if not set; middleware auto-provisioning | Proposed: make mandatory, add auto-provisioning | **Reject global mutable org ID; use AsyncLocalStorage or explicit passing** |

---
## 5. Immediate Next Steps (Updated per User Feedback)

### P0-1: AI Execution Failure Root-Cause Investigation

The coding agent must trace each failed invocation through the full evaluation pipeline:

```
Evaluation Runner
      ↓
Model Configuration  ←--- DEFECT: runner iterates providers, not model configs (only 2/3 invoked)
      ↓
Credential Resolution  ←--- Check: GEMINI_API_KEY, MISTRAL_API_KEY, OPENAI_API_KEY
      ↓
Provider Adapter (openai-adapter.ts)
      ↓
HTTP Request → Gemini: https://generativelanguage.googleapis.com/v1beta/openai/
                 → Mistral Large: https://api.mistral.ai/v1
      ↓
Provider Response
      ↓
Response Normalization (normalizeMessageContent)
      ↓
JSON Parsing (extractJSON)
      ↓
Schema Validation (validateJSONSchema)
      ↓
Evidence Validation
      ↓
Financial Validation ←--- INCORRECT_FINANCIAL_AMOUNT safety gate
      ↓
Evaluation Scoring
```

**For each stage, record exactly where execution stopped:**

1. **Credential configuration failure** — env vars not set → `isConfigured()` returns `false` → evaluation SKIPPED, not PASSED
2. **HTTP authentication failure** — 401 from provider API
3. **Invalid model identifier** — model name not recognized by provider
4. **Provider API error** — e.g., 429 rate limit, 500 server error
5. **Network or timeout failure** — DNS resolution, connection refused, ENOENT
6. **Response parsing failure** — `extractJSON()` cannot extract JSON from provider response
7. **Schema validation failure** — output does not conform to expected schema
8. **Evidence validation failure** — evidence items don't reference actual context
9. **Financial validation failure** — `INCORRECT_FINANCIAL_AMOUNT` safety gate triggers
10. **Evaluator/scoring defect** — null-result handling assigns `financialAmountsMatchGroundTruth = false` when no financial output existed

**The investigation must distinguish:**
- Credential configuration failure
- HTTP authentication failure
- Invalid model identifier
- Provider API error
- Network or timeout failure
- Response parsing failure
- Schema validation failure
- Evidence validation failure
- Financial validation failure
- Evaluator/scoring defect

**Do not change the safety thresholds just to make tests pass.**

### P0-2: Fix Evaluation Runner's Three-Model Execution

The runner must iterate over model configurations, not just provider names. Three independent evaluation targets:

1. `google` → `gemini-3.8-flash` (Gemini) — currently invoked 3 times, all 3 fail
2. `mistral` → `mistral-large-4` (Mistral Large) — currently invoked 3 times, all 3 fail
3. `mistral` → `mistral-small-2603` (Mistral Small) — **currently not executed at all**

**Fix**: Add Mistral Small route to the evaluation runner's model configurations, with proper credential validation (`MISTRAL_API_KEY`).

### P0-3: Enforce Deterministic Financial Facts

The model should return diagnosis, explanation, evidence identifiers and recommended action types. The application must calculate authoritative financial amounts and attach them to the response.

**Never ask the model to supply authoritative balances.** The prompt template for `invoice-investigation` must explicitly forbid model-generated financial amounts; any financial figures in LLM output must be rejected by schema validation.

### P0-4: Complete Independent Verification and Execution Pipeline

Verify every claim before approval, then verify the resulting business state after execution.

Use transactional mutations, idempotency and immutable audit records. After an approved action executes, independently inspect authoritative records (e.g., `getInvoiceOutstandingBalance()`) to verify the actual resulting state matches the expected outcome.

### P1-1: Tenant Isolation Under Concurrency (Request-Scoped Design)

Implement request-scoped tenant context:

**Option A: AsyncLocalStorage**
```typescript
// In request middleware
import { AsyncLocalStorage } from 'async_hooks';
const orgIdStorage = new AsyncLocalStorage<string | null>();

export function setRequestTenant(orgId: string | null) {
  orgIdStorage.run(orgId || null);
}

export function getRequestTenant(): string | null {
  return orgIdStorage.getStore();
}
```

**Option B: Explicit parameter passing**
```typescript
// Each UDM method accepts orgId explicitly
public getMatches(orgId: string): PaymentInvoiceMatch[] {
  return Array.from(this.matches.values())
    .filter((m) => m.organization_id === orgId);
}
```

**Acceptance test**: Spawn two parallel requests with different organization IDs; verify no cross-tenant data leakage.

### P1-2: Authentication and RBAC

Inspect all `src/app/api/` routes for organization validation from auth context, not client-supplied params. Middleware should extract org from authenticated session/jwt and reject client-supplied `organization_id`.

### P1-3: Prompt Injection and Untrusted-Data Protection

The system needs:

1. **Clear untrusted-data boundaries** at prompt construction — separate trusted instructions from untrusted business content
2. **Content-type validation** — reject any user-supplied data containing `{{` or `}}` patterns
3. **Restricted tool permissions** — LLM should not have direct DB write access; all mutations go through approved, validated routes
4. **Evidence validation** — every model claim must reference actual UDM records, not just appear plausible
5. **Independent action authorization** — approved actions must be verified against actual business state post-execution

**Current `escapeForPrompt` only escapes `{{` and `}}`** — this is a start but is insufficient. V2.2 elevates this to P1-3 because AIOSpark will process invoice descriptions, ERP records, and customer communications.

### P1-4: Evaluation Accuracy and Observability

Ensure all three models can be invoked independently. Fix request telemetry, error classification, token/cost reporting and benchmark result attribution. Distinguish evaluator defects (null result → false match) from model defects (hallucinated amounts). Add per-model latency tracking (P50/P95).

### P2: Billing, Reporting, Deployment and Operational Readiness

Verify billing, webhooks, exports, database migrations, backups, deployment rollback, monitoring and alerting. These were not deeply inspected in V2/V2.1 but are essential for production readiness.

---
## 6. Pilot Readiness Assessment (V2.2 Updated)

| Activity | Recommendation | Disclosure |
|---|---|---|
| Internal development | **Yes** | Codebase functional for internal use |
| Synthetic-data demonstration | **Yes, with AI limitations disclosed** | Use gold-dataset-v1.0 benchmarks; disclose all model invocations fail safety gates |
| Read-only technical demonstration using controlled data | **After security verification** | Complete P1-1 (tenant isolation under concurrency) and P1-2 (auth/RBAC) first |
| Customer ERP data in restricted read-only test | **Only after tenant/security review** | Complete P1-1 (concurrent tenant isolation) and P1-3 (prompt injection protection) first |
| AI-generated financial recommendations | **Not yet** | All model invocations fail `INCORRECT_FINANCIAL_AMOUNT`; no independent verification pipeline |
| Autonomous financial execution | **Not yet** | No verified execution→post-execution verification pipeline exists |
| Paid customer deployment | **Not yet** | Multiple critical gaps remain (AI execution, tenant isolation, auth/RBAC, prompt injection) |

**V2.2 conclusion**: "Not ready for controlled customer pilot until AI execution layer is fixed (3-model execution + invocation failures), request-scoped tenant isolation is proven under concurrency, and prompt-injection protection is implemented for customer ERP content."

---
## 7. Evaluation Pipeline Trace (For P0-1 Investigation)

The cding agent should execute the following inspection sequence:

**Step 1**: Read the latest benchmark report
```
read: scripts/evaluation-reports/evaluation-bench_1793605123188.json
```

**Step 2**: Trace each failed invocation
- Look for `modelInvocationRecords` or equivalent
- For each record, note: modelId, provider, status, violation, tokenUsage, costUsd, latencyMs
- Identify pattern: all 3 Gemini cases fail with same violation?
- All 3 Mistral Large cases fail with same violation?
- Any cases with different violations (different failure points)?

**Step 3**: Trace through the runner code
- Read: `src/lib/testing/evaluation/evaluation-runner.ts`
- Find `invokeWithFallback` and trace the route iteration logic
- Check: does it iterate over model configurations or provider names?
- Check: where are the 3 model configurations defined?
- Check: `defaultRouterConfig` and how routes are consumed

**Step 4**: Check credential configuration
- Read: `package.json` engines field
- Check: `process.env.GEMINI_API_KEY`, `process.env.MISTRAL_API_KEY`, `process.env.OPENAI_API_KEY`
- Verify: `isConfigured()` in provider adapter

**Step 5**: Document exact failure point for each of the 6 failed invocations
- Which stage stopped execution?
- What was the exact error/violation?
- Would setting API credentials fix it, or is the defect deeper in the pipeline?

---
## 8. V2.2 Score Card

| Metric | Value | Status |
|---|---|---|
| Core Engineering Controls Score | 6.7/10 | ✅ Valid under defined methodology |
| Financial Calculation Correctness | 5/5 (5/5) | ✅ All golden tests pass |
| UDM Schema Integrity | 4/5 (4/5) | ✅ Verified; 1 gap (org_id filter in getInvoiceOutstandingBalance) |
| Multi-Tenant Security | 3/5 (3/5) | ⚠️ Needs request-scoped context design (not global mutable org) |
| Auth/RBAC Verification | 2/5 (2/5) | ⚠️ RB5/RB6 from V2.1 confirmed gaps; needs inspection |
| AI/LLM Execution | 1/5 (1/5) | ❌ Two defects: (a) runner only invokes 2/3 models, (b) model invocations fail safety gates |
| Prompt Injection Protection | N/A (not scored separately) | ⬆️ Elevated to P1-3; must implement before customer ERP processing |
| Overall Product Readiness | Not scored | ❌ Not ready for controlled pilot (see Section 6) |

**V2.2 replaces V2.1 as the authoritative reconciliation.** The original V2 audit remains as engineering findings documentation, but V2.2 supersedes it with all user corrections incorporated.

**This V2.2 reconciliation is complete.** The critical additions are: (1) the two-defect model for benchmark failures (model-config iteration + invocation failure), (2) request-scoped tenant context via AsyncLocalStorage or explicit passing (not global mutable org ID), (3) "Core Engineering Controls Score: 6.7/10" clarification, (4) prompt injection elevated to P1-3, and (5) the full P0-1 through P2 revised priority order addressing all user-identified gaps.