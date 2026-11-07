# AIOSpark AI Safety & Risk Guardrails Architecture (Layer 30)

## Executive Summary for Enterprise Security & Compliance Teams

AIOSpark employs a **structurally enforced, 8-step safety pipeline** embedded directly into the central `AgentExecutor` runtime middleware. This architecture guarantees that **no AI Agent module or third-party integration can bypass risk assessment or execute unauthorized financial actions**.

---

## The 8-Step Safety Middleware Pipeline

```
[User/Agent Action Request]
       │
  1. Permission Check (RBAC: User/Role Privileges)
       │
  2. Policy Check (Subscription, Allowed Actions & Rate Limits)
       │
  3. Data Validation (Stale Record & Active State Interception)
       │
  4. AI Reasoning Decision (LLM Call Encapsulation)
       │
  5. Risk Assessment (Non-Bypassable Hardcoded Product Floor)
       │
  6. Approval Requirement Routing (Layer 18 Human Approval Queue)
       │
  7. Action Execution (Executed ONLY after approval)
       │
  8. Verification (Outcome matches approved intent)
```

---

## Detailed Guardrail Mechanism Specifications

### 1. Permission Check (RBAC Verification)
- **Mechanism**: Verifies acting context against Layer 3 RBAC policies.
- **Security Guarantee**: Unprivileged roles (e.g., `Viewer`) are blocked from proposing or executing financial modifications (`ALTER_INVOICE_VALUE`, `ISSUE_CREDIT_NOTE`, etc.).

### 2. Policy Check (Subscription & Rate Limiting)
- **Mechanism**: Evaluates org subscription status and rate limits.
- **Security Guarantee**: If an organization's subscription is suspended/canceled, all agent actions are immediately blocked. Enforces a maximum action frequency window (e.g. max 20 actions per 60 seconds).

### 3. Data Validation (Stale Analysis & Record State Protection)
- **Mechanism**: Verifies target UDM entity existence and state before and after AI reasoning.
- **Security Guarantee**: Prevents acting on stale AI analysis. If an invoice was deleted, modified, or marked `paid`/`void` after the AI analysis was generated, the pipeline intercepts and aborts execution.

### 4. AI Reasoning Decision
- **Mechanism**: Encapsulates LLM calls inside `AgentExecutor.callModel()`.
- **Security Guarantee**: Provides provider abstraction, token limit enforcement, timeout handling (5000ms), and cost tracking.

### 5. Risk Assessment (Non-Bypassable Product Floor)
- **Mechanism**: Evaluates hardcoded product-wide safety floors **before** any per-organization autonomy configuration is consulted:
  - **Amount Ceiling Floor**: Any action affecting an amount `≥ ₹5,00,00,00` (Paise 50,000,000) **must force human approval**. This ceiling is hardcoded and cannot be configured above ₹5,00,000 by any org setting.
  - **High-Risk Action Types**: Mandatory human approval for `ALTER_INVOICE_VALUE`, `ISSUE_CREDIT_NOTE`, `RECORD_PAYMENT_MATCH`, `SEND_CUSTOMER_COMMUNICATION`, `MODIFY_ACCOUNTING_RECORD`, and `RECLASSIFY_INVOICE`.
  - **Confidence Floor**: Any AI analysis with confidence `< 60%` **must force human approval**.
- **Security Guarantee**: Organization settings cannot override or disable these safety floors.

### 6. Approval Requirement Routing & Double-Click Guard
- **Mechanism**: Routes high-risk actions to Layer 18 `approval_requests` queue with an append-only audit trail. Includes hash-based idempotency checks.
- **Security Guarantee**: Rapid duplicate action proposals within a 5-second window are automatically intercepted and suppressed to prevent accidental double execution.

### 7. Action Execution
- **Mechanism**: Action payload execution occurs **only after explicit human approval** in the Approval Center (or after passing all 8 guardrails with zero risk flags).

### 8. Output Verification Engine
- **Mechanism**: Re-evaluates target state post-execution via `AgentVerificationEngine.verifyOutput()`.
- **Security Guarantee**: Ensures the executed outcome matches what was approved by human reviewers.

---

## Adversarial Defense Verification

The safety pipeline is verified via automated adversarial tests (`npm run test:safety`):
1. **Direct Bypass Resistance**: Lower-level policy checks enforce the same risk assessment floors internally.
2. **Autonomy Override Resistance**: Malicious or misconfigured org settings attempting `min_confidence = 0%` or `max_amount = ₹10,00,00,000` are defeated by the hardcoded product floor.
3. **Stale Data Protection**: Actions targeting already-resolved/paid invoices are caught and blocked in Step 3.
4. **Idempotency Protection**: Rapid double-click submissions are intercepted and prevented.
5. **Zero-Code Agent Inheritance**: Any new dummy agent automatically inherits all 8 guardrail steps without custom safety code.
