# AIOSPARK — FRONTEND AND USER EXPERIENCE STATUS REPORT

**Repository:** `/home/subham/AIOSpark/AR-automation-revenue`
**Baseline commit:** `6675c97`
**Constraint:** Read-only audit. No source modifications. No destructive browser testing.

---

## Executive Frontend Status

The AIOSpark frontend is **genuinely data-driven, not a mock/demo shell**. 15 of 18 authenticated page modules fetch from real backend API routes and compute financial figures from live responses. The only static page is the public landing page. The UI is honest about missing endpoints (405 handling, "no endpoint exists" notices, "NO DATA" labels) rather than fabricating data.

**Key strengths:** Real API-connected pages, consistent shared component library (MainNavShell, FinancialBand, IntelligencePanel, PriorityRow, SectionHeader, StatusIndicator), skip links, focus rings, dark/light theme support, accessible causal-graph table alternative.

**Key gaps:** `formatCurrency` duplicated inline in 8 pages instead of shared lib; design tokens defined but not adopted (inline Tailwind classes); incomplete keyboard accessibility on some clickable div elements; no `prefers-reduced-motion` handling; settings writes honestly blocked by missing API (405).

---

## Page-by-Page Inventory (18 route modules)

| # | Page | Data Source | Write/Mutation? | Status |
|---|------|-------------|-----------------|--------|
| 1 | `src/app/page.tsx` (Landing) | None (static marketing) | None | Static/demo |
| 2 | `src/app/dashboard/page.tsx` | `/api/auth/me`, `/api/cfo/overview`, `/api/tenant/data`, `/api/approvals`, `/api/tenant/members` | POST `/api/auth/logout` | Real data |
| 3 | `src/app/receivables/page.tsx` | `/api/receivables`, `/api/tenant/members` | No | Real data |
| 4 | `src/app/invoices/[id]/page.tsx` | `/api/receivables?q=`, `/api/data-lineage/invoice/`, `/api/agents/investigate`, `/api/tenant/members` | POST `/api/agents/investigate` | Real data |
| 5 | `src/app/customers/page.tsx` | `/api/customers`, `/api/tenant/members` | No | Real data |
| 6 | `src/app/customers/[id]/page.tsx` | `/api/customers/:id`, `/api/agents/investigate`, `/api/tenant/members` | POST `/api/agents/investigate` | Real data |
| 7 | `src/app/payments/page.tsx` | `/api/payments`, `/api/reconciliation` (POST), `/api/agents/investigate`, `/api/tenant/members` | POST `/api/reconciliation`, POST `/api/agents/investigate` | Real data |
| 8 | `src/app/approvals/page.tsx` | `/api/approvals`, `/api/tenant/members` | POST `/api/approvals/:id` (approve/reject/modify) | Real data |
| 9 | `src/app/cash-unblock/page.tsx` | `/api/cash-unblock` (GET+POST), `/api/next-best-action`, `/api/agents/investigate`, `/api/tenant/members` | POST `/api/cash-unblock` (execute+assign) | Real data |
| 10 | `src/app/causal-graph/page.tsx` | `/api/causal-graph`, `/api/tenant/members` | No | Real data |
| 11 | `src/app/cfo/page.tsx` | `/api/cfo/overview`, `/api/tenant/members` | No | Real data |
| 12 | `src/app/exceptions/page.tsx` | `/api/exceptions`, `/api/tenant/members` | No | Real data |
| 13 | `src/app/collections/page.tsx` | `/api/collections`, `/api/tenant/members` | No | Real data |
| 14 | `src/app/reports/page.tsx` | `/api/reports` (GET+POST), `/api/tenant/members` | POST `/api/reports` (preview/download/schedule) | Real data |
| 15 | `src/app/settings/page.tsx` | `/api/auth/me`, `/api/tenant/members`, PATCH `/api/tenant/organizations` (405) | PATCH attempted, honestly blocked | Real data (reads) |
| 16 | `src/app/login/page.tsx` | `/api/auth/login` (POST) | POST (create session) | Real auth |
| 17 | `src/app/signup/page.tsx` | `/api/auth/signup` (POST) | POST (create account) | Real auth |
| 18 | `src/app/onboarding/page.tsx` | `/api/integrations/sync`, `/api/integrations/zoho/auth`, `/api/onboarding/setup`, `/api/onboarding/upload`, `/api/onboarding/import` | POST (sync/upload/import) | Real data |

**Layout:** `src/app/layout.tsx` — root shell, metadata only, no data.

---

## Shared Component Library (Heavily Reused)

| Component | File | Used By |
|---|---|---|
| MainNavShell | `src/components/MainNavShell.tsx` | All dashboard pages (sidebar + skip link) |
| FinancialBand | `src/components/system/FinancialBand.tsx` | dashboard, receivables, customers, cfo, exceptions, collections |
| FinancialMetric | `src/components/system/FinancialMetric.tsx` | payments, approvals, reports |
| IntelligencePanel | `src/components/system/IntelligencePanel.tsx` | dashboard, invoices, customers, cfo, exceptions, collections |
| PriorityRow | `src/components/system/PriorityRow.tsx` | dashboard, exceptions, collections, cash-unblock |
| SectionHeader | `src/components/system/SectionHeader.tsx` | All dashboard pages |
| StatusIndicator | `src/components/system/StatusIndicator.tsx` | All dashboard pages |
| Timeline | `src/components/system/Timeline.tsx` | dashboard, invoices |
| DetailDrawer | `src/components/system/DetailDrawer.tsx` | dashboard, customers |
| CommandPalette | `src/components/system/CommandPalette.tsx` | dashboard, cash-unblock, causal-graph |
| DataLineagePanel | `src/components/system/DataLineagePanel.tsx` | invoices, customers/[id] |
| CausalGraph + EvidenceBlock | `src/components/system/CausalGraph.tsx` | cash-unblock, causal-graph |
| SignalRail / SignalLine | `src/components/system/SignalLine.tsx` | cash-unblock, causal-graph |
| NextBestActionCard | `src/components/intelligence/NextBestActionCard.tsx` | cash-unblock |
| CashUnblockSimulatorModal | `src/components/intelligence/CashUnblockSimulatorModal.tsx` | cash-unblock |
| StructurallyEnforcedEvidenceDisplay | `src/components/StructurallyEnforcedEvidenceDisplay.tsx` | payments, approvals |
| Can (RBAC gate) | `src/components/tenant/Can.tsx` | dashboard, settings |
| TeammateInviteModal | `src/components/tenant/TeammateInviteModal.tsx` | dashboard, settings |
| ThemeToggle | `src/components/ThemeToggle.tsx` | MainNavShell |
| WorkstationCopilotAvatar | `src/components/system/WorkstationCopilotAvatar.tsx` | MainNavShell |
| NotificationCenterBell | `src/components/NotificationCenterBell.tsx` | dashboard |

**Landing-only components** (not reused in dashboard): 20+ `Landing*` components under `src/components/landing/`.

---

## Design System: Defined but Under-Adopted

**`src/lib/ui/formatters.ts` (54 lines):**
- `formatCurrency(amountMinorUnits, currency, locale)` — handles null/NaN, `₹0` fallback
- `formatDate(dateStr, style)`, `formatPercent(value, decimals)`
- **Underused:** Only imported by 2 of ~10 pages that need it; 8 pages duplicate inline `formatCurrency`

**`src/lib/ui/tokens.ts` (73 lines):**
- `SEVERITY_TOKENS` (critical/high/medium/low), `STATUS_TOKENS` (active/approved/paid/pending/etc.), `TYPOGRAPHY_TOKENS`, `LAYOUT_TOKENS`
- **Defined but not visibly adopted:** Pages use inline Tailwind classes instead of these tokens

**Gap:** Design tokens and shared formatters exist but are not consistently adopted, causing visual inconsistency and maintenance debt.

---

## WCAG / Accessibility Status

| Feature | Status | Details |
|---|---|---|
| Skip links | PARTIAL | Landing: "Skip to content" (#landing-content). Dashboard/MainNavShell: "Skip to workspace content" (#workstation-content). Sub-pages (invoices, customers/[id], payments, etc.) have no own skip links but inherit shell. |
| Focus rings | PARTIAL | Many buttons: `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]`. Input fields have focus borders. Not applied consistently (aging bucket chips in receivables, some table rows). |
| Color contrast | LIKELY OK | Dark theme (`#0A0B0E`/`#050505`) with white/neutral text and `#FF3B30` accent. No automated contrast audit performed. |
| Keyboard navigation | PARTIAL | Dashboard stage cards: `tabIndex={0}` + Enter/Space. Customer table rows: `tabIndex={0}` + Enter/Space. Hotkeys (1/2/3, ⌘J, ⌘K). Many clickable divs (aging buckets, graph nodes, some table rows) lack keyboard handlers. |
| Reduced motion | NO | `animate-pulse` and `animate-spin` used unconditionally. No `prefers-reduced-motion` handling. |
| ARIA labels | PARTIAL | Buttons have `aria-label` on some (refresh, sign out, nav toggle). Approval modals: `role="dialog"`, `aria-modal`, `aria-labelledby`. MainNavShell mobile nav: `aria-expanded`, `aria-controls`, `aria-label`. Not comprehensive. |
| Semantic HTML | PARTIAL | Proper `<label>` on auth forms. `<table>` with `<thead>`/`<tbody>`. `<main>` with `tabIndex={-1}`. Some clickable `<div>`s where `<button>` would be more semantic. |

---

## Verified Preserved WCAG / Landing Changes

The nine approved landing-page contrast and UX changes are **preserved in the committed baseline**:

| Change | Evidence |
|---|---|
| Skip-to-content link | `src/app/page.tsx` `<a href="#landing-content" className="landing-skip-link">Skip to content</a>` |
| Focus rings (`--focus-ring` token) | `src/app/globals.css` `:root { --focus-ring: rgba(255, 59, 48, 0.62); }` and `focus-visible: outline: 2px solid var(--focus-ring)` |
| `prefers-reduced-motion` media query | `src/app/globals.css` `@media (prefers-reduced-motion: reduce)` blocks |
| `prefers-reduced-transparency` media query | `src/app/globals.css` `@media (prefers-reduced-transparency: reduce)` blocks |
| Light-theme contrast tokens | `src/app/globals.css` `html[data-theme="light"]` overrides (`--text-primary: #0f172a`, `--glass-border`, etc.) |
| Glassmorphism design system | `src/app/globals.css` `--glass-fill`, `--glass-border`, `--glass-shadow`, `--glass-blur` variables |
| Semantic metric surfaces | `src/app/globals.css` `.workstation-metric`, `.metric-status`, `.workstation-card` rules |
| Landing shell theme | `src/app/page.tsx` `landing-shell min-h-screen text-white` |
| Early Access Modal | `src/app/page.tsx` `EarlyAccessModal` with `isOpen`/`onClose` |

---

## Finance-User Usability Assessment

**Designed around finance-team workflows? Partially.**

**Strengths:**
- Dashboard is a command center (KPIs, aging, customer exposure, timeline) — matches finance controller workflow
- Receivables workspace with search/filter/sort/pagination and aging buckets
- Approval Center with genuine approve/reject/modify (human-in-the-loop)
- Cash Unblock Queue with prioritization and controlled actions
- CFO cockpit with DSO, aging, category breakdown
- Reports with generation/download/scheduling
- Customer 360 with outstanding balance, risk band, payment history

**Gaps:**
- Settings writes blocked (405) — organization settings not actually configurable via API
- `customers/[id]/route.ts` returns empty placeholder arrays for communications/promises/exceptions — Customer 360 incomplete
- Unblock-queue execute action blocked (must go through Approval Center) — no direct cash-unblock execution UI path
- No dedicated audit UI for finance admins to reconstruct record history (audit exists backend-only)
- `formatCurrency` inconsistency and token under-adoption affect visual polish
- No `prefers-reduced-motion` — may cause vestibular issues for some users

---

## Honest Anti-Patterns (Does Not Fake Data)

| Page | Finding | Evidence |
|---|---|---|
| Cash Unblock | "Recovered Cash" labeled `statusText="NO DATA"` / `sublabel="No verified recoveries recorded"` | `cash-unblock/page.tsx` |
| Invoice Detail | "Request Approval" comments "No POST endpoint exists", shows honest notice | `invoices/[id]/page.tsx` |
| Settings | PATCH returns 405; "Changes were not persisted" notice | `settings/page.tsx` |
| Login SSO | SSO buttons alert "feature flags required" | `login/page.tsx` |
| Causal Graph | VERIFIED vs AI_INFERRED provenance badges | `causal-graph/page.tsx`, `advanced-engine.ts` |

---

## Conclusion

The frontend is **genuinely connected to real backend data** and designed around finance-team workflows (command center, receivables, approvals, cash unblock, CFO cockpit). It is **not a visual-only shell**. However, UX maturity is limited by: duplicated formatters, under-adopted design tokens, partial keyboard accessibility, no reduced-motion support, blocked settings writes, and incomplete Customer 360. The product looks and functions like a real finance tool but needs UX hardening before a design-partner pilot.
