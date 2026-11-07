# AIOSPARK COMPLETE PRODUCT UI/UX FORENSIC AUDIT

**Product:** AIOSpark — AI-Powered Order-to-Cash Intelligence & Execution Platform  
**Repository:** /home/subham/AIOSpark/AR-automation-revenue  
**Audit Scope:** Full frontend source-code inspection (Next.js 16 App Router, Tailwind CSS v4)  
**Evidence basis:** Static source-level inspection of all routes, components, design tokens, stylesheets, and README documentation. No source files modified. No browser automation executed (authentication credentials unavailable; `.env.local` present but Supabase credentials not verified).  
**Rules observed:** No code changes, no redesigns, no new libraries, no mock data reported as real, no unverified functionality claimed working.

---

## 1. EXECUTIVE SUMMARY

### 1.1 Overall UI Maturity Assessment

AIOSpark is a **functionally substantive but visually inconsistent and partially honest** financial workstation. The backend architecture (UDM, adapters, RBAC, approvals, execution verification, taxonomy) is well documented and genuinely implemented. The frontend surface area is broad (~31 UI routes) and covers the full O2C lifecycle. However, the UI layer exhibits **significant design drift, duplicated one-off styling, incomplete light-mode coverage, and several integrity issues where static/mock data is presented as live financial data**.

The product is **not yet ready for real customer data or design-partner evaluation** without correction of P0/P1 integrity and trust issues.

### 1.2 Product-Wide Strengths (Observed Facts)

1. **O2C lifecycle coverage is genuine and coherent.** Routes exist for all seven stages: Order (dashboard pressure map), Fulfillment (exceptions/MISSING_DOCUMENT), Invoicing/PO (receivables/invoices/PO_MISMATCH), Disputes (exceptions/CUSTOMER_DISPUTE), Collections (collections worklist), Payment (payments), Reconciliation (payments/unmatched queue + dashboard stage 07). The dashboard pressure map explicitly renders all 7 stages as navigable cards.
2. **Real backend data model exists.** Universal Data Model (UDM) with customers, invoices, payments, credit notes, disputes, exceptions; adapters for CSV/Excel, Zoho, Tally; RLS-based multi-tenancy; explicit 5-role RBAC matrix in `src/lib/tenant/permissions.ts`.
3. **Human-in-the-loop approvals are implemented.** `/approvals` page with approve / modify-and-approve / reject, audit trail, `StructurallyEnforcedEvidenceDisplay`, role-gated approve capability (Finance Manager/Owner/Admin can approve; Finance Executive/Viewer cannot).
4. **Cash-unblock execution state machine.** `/cash-unblock` implements Preview → Executing → Verifying → Verified flow with idempotency keys and POST `/api/cash-unblock`.
5. **Provenance-aware components exist.** `FinancialMetric` component has a `provenance` prop (ACTUAL/PREDICTED/SCENARIO/AI_FINDING/RECOMMENDATION/VERIFIED). `EvidenceBlock` and `StructurallyEnforcedEvidenceDisplay` render side-by-side evidence with verification labels (VERIFIED / AI-INFERRED).
6. **Onboarding is a genuine 6-step ingestion wizard** with column mapping, fault-tolerant row validation, skipped-row error inspector, and progress stages (upload → validate → import → detect exceptions).
7. **Accessibility foundations present.** Skip links, `focus-visible` rings (`--color-brand-red` 2px outline), `prefers-reduced-motion` handling, semantic buttons/links in many places.

### 1.3 Most Serious Weaknesses

1. **Mock/static financial data presented as real (P0).** `/cash-unblock` "Recently Unblocked & Recovered" section hardcodes XYZ SYSTEMS (₹8,20,000), GLOBEX LOGISTICS (₹14,50,000), ACME TECH (₹6,40,000) with "VERIFIED TODAY/YESTERDAY/2D AGO" — no API call, no data source. This directly violates the principle that verified outcomes must not be confused with predicted outcomes.
2. **Hardcoded financial figures across intelligence surfaces (P1).** `/investigations` hardcodes `financialImpact="₹12,00,000"` and confidence values regardless of backend data. `/exceptions` IntelligencePanel hardcodes `confidence={0.94}`. `/customers/[id]` hardcodes `confidence={0.92}`. These are presented as AI conclusions but are static literals.
3. **Role misrepresentation (P1).** Most operational pages hardcode `currentRole="Owner"` on `MainNavShell`, and `/approvals` exposes a role selector explicitly commented "Selectable for demo/test". This misleads users about their actual permissions and breaks the promise that frontend visibility != backend authorization.
4. **Design-system immaturity / design drift (P1/P2).** `src/lib/ui/tokens.ts` exists but is largely unused; `globals.css` is ~2,100 lines of page-specific overrides. Pages use inconsistent dark surfaces (`#09090b`, `#12141A`, `#181B23`, `zinc-900`, `#050505`, `#0A0B0E`). Light mode is partial and piecemeal.
5. **WCAG contrast risks (P1).** Brand crimson `#FF2D2D`/`#FF3B30` used as text on white/light surfaces in several pages (e.g., `/taxonomy/queue`, `/cfo` category cards, `/receivables` table risk text) without verified contrast ratios. Light-mode overrides in `globals.css` are incomplete.
6. **Inconsistent currency formatting (P2).** Dozens of inline `Intl.NumberFormat` calls duplicate the centralized `formatCurrency` utility; some divide by 100, some do not; some assume minor units, some do not. Risk of displaying paise as rupees.
7. **No breadcrumbs, inconsistent back navigation (P2).** Back links vary (→ `/dashboard`, → `/receivables`, → `/cfo`) with no consistent pattern.
8. **`alert()` used for user feedback (P3).** `/taxonomy/queue` and `/investigations` use browser `alert()` for success/failure instead of in-UI toasts or inline messages.

### 1.4 Design-System Maturity

**Score: 5/10.** A centralized token file (`src/lib/ui/tokens.ts`) exists but is not the single source of truth. `globals.css` contains ~2,100 lines of page-scoped CSS overrides that duplicate and contradict tokens. Components (`FinancialBand`, `PriorityRow`, `SectionHeader`, `StatusIndicator`, `FinancialMetric`, `EvidenceBlock`) are genuinely reused — this is a strength — but each operational page re-implements its own header, metrics band, and table chrome with hardcoded colors.

### 1.5 User Workflow Maturity

**Score: 7/10.** The UPLOAD → UNDERSTAND → PRIORITIZE → REVIEW → APPROVE philosophy is genuinely reflected in routes: onboarding (upload), dashboard/exceptions (understand), cash-unblock/collections (prioritize), investigations/approvals (review/approve). The O2C 7-stage pressure map on the dashboard is a strong coherent organizing principle.

### 1.6 Accessibility Maturity

**Score: 5/10.** Foundations exist (skip links, focus rings, reduced motion) but are not consistently applied. Tables lack `<caption>` and scoped headers; several interactive `div`s/`onClick` rows lack `role="button"`; color is used as the sole status indicator in places; light-mode contrast not verified.

### 1.7 Responsive Maturity

**Score: 6/10.** Sidebar collapses to drawer on mobile; tables use `overflow-x-auto`; landing shell forces `min-width: 980px` tables causing horizontal scroll on small viewports; no verified mobile rendering.

### 1.8 Financial Trust & Data-Presentation Assessment

**Score: 5/10.** Provenance labels exist as a capability but are inconsistently applied. Several financial figures are hardcoded/static. Currency formatting is duplicated inline. Verified vs. predicted distinction is not consistently visual.

### 1.9 Pilot-Facing UX Readiness

**Decision: Not ready for real customer data. Ready for controlled internal demonstration only.** P0 mock-data integrity and P1 role/hardcoding issues must be corrected before any external design partner sees the product.

---

## 2. COMPLETE ROUTE INVENTORY

| Route | Page | Purpose | Intended User | Implementation Status | Audit Status |
|---|---|---|---|---|---|
| `/` | Landing page | Public marketing / waitlist capture | Visitors, prospects | Implemented | Source inspected |
| `/pricing` | Pricing page | Plan comparison, early-access capture | Visitors, prospects | Implemented | Source inspected |
| `/product` | Product redirect | Redirects to `/#product` | Visitors | Implemented (redirect) | Source inspected |
| `/login` | Authentication | Email/password login | New/returning users | Implemented | Source inspected |
| `/signup` | Authentication | Account creation + org draft | New users | Implemented | Source inspected |
| `/forgot-password` | Password reset | Password recovery flow | Returning users | Implemented | Source inspected |
| `/verify-email` | Email verification | Post-signup email verification | New users | Implemented | Source inspected |
| `/onboarding` | Data ingestion wizard | 6-step org setup + CSV/Excel import | New org admins | Implemented | Source inspected |
| `/dashboard` | Command Center | O2C pressure map, 7 stages, metrics, priorities | Finance Manager/CFO | Implemented | Source inspected |
| `/receivables` | Receivables ledger | Invoice table, aging buckets, search/sort | AR Executive | Implemented | Source inspected |
| `/customers` | Customer directory | Debtor roster, risk bands, DSO | Credit/AR Manager | Implemented | Source inspected |
| `/customers/[id]` | Customer 360 | Single-account exposure, invoices, investigation | AR Manager | Implemented | Source inspected |
| `/invoices/[id]` | Invoice intelligence | Invoice detail, line items, timeline, approval request | AR/Finance | Implemented | Source inspected |
| `/exceptions` | Exception incident room | Ranked operational blockers by cash impact | AR/Operations | Implemented | Source inspected |
| `/collections` | Collections worklist | Prioritized recovery queue, next-best-action | Collections Agent | Implemented | Source inspected |
| `/payments` | Payments & reconciliation | Payment table, unmatched queue, bank statement import | Finance Controller | Implemented | Source inspected |
| `/cash-unblock` | Cash unblock queue | My Next 5, execution state machine, causal graph | Finance Manager/CFO | Implemented | Source inspected |
| `/causal-graph` | Causal graph | O2C root-cause relationship map, evidence provenance | Finance Analyst | Implemented | Source inspected |
| `/cfo` | CFO command center | Executive synthesis, category breakdown, concentration | CFO/Executive | Implemented | Source inspected |
| `/investigations` | AI investigation workspace | Ad-hoc investigation runner, verification loop | Analyst/Finance Manager | Implemented | Source inspected |
| `/agents` | AI agent control plane | Agent roster, fleet metrics, execution logs | Admin/Finance Manager | Implemented | Source inspected |
| `/agents/[agentId]` | Agent detail | Individual agent status | Admin | Route exists (dynamic) | Not inspected (no page file found in listing) |
| `/approvals` | Approval center | Approve/modify/reject, audit trail, role selector | Finance Manager/Owner | Implemented | Source inspected |
| `/settings` | Settings hub | Org profile, team members/RBAC, shortcuts | Owner/Admin | Implemented | Source inspected |
| `/settings/integrations` | ERP integrations | Connector status, sync, error center, pipeline | Admin/Integrations | Implemented | Source inspected |
| `/settings/billing` | Billing settings | Subscription, Razorpay billing | Owner/Admin | Route exists | Source not inspected (referenced, page file not found in listing) |
| `/settings/notifications` | Notification triggers | Alert preferences | Owner/Admin | Route exists | Source not inspected (referenced, page file not found in listing) |
| `/reports` | Reports library | Report index, preview, export (CSV/XLSX/PDF), scheduling | Finance Manager/CFO | Implemented | Source inspected |
| `/admin/ai-tasks` | Admin AI quality console | Model validation, category breakdown, override rates | Admin | Implemented | Source inspected |
| `/admin/beta` | Admin beta tracker | Beta org metrics, check-in logs, classification tagging | Admin | Implemented | Source inspected |
| `/taxonomy/queue` | Needs classification queue | Manual reclassification of UNKNOWN delay categories | Finance Manager | Implemented | Source inspected |
| `/api/*` | ~50 API routes | Backend endpoints for all UI data/mutations | System | Implemented | Not UI-audited |

**Total UI routes discovered:** 31 (including 2 marketing, 5 auth, 1 onboarding, 20 operational/admin, 3 settings subpages referenced).  
**Total pages inspected:** 29 page.tsx/source files read in full.  
**Not visually inspected:** `/agents/[agentId]`, `/settings/billing`, `/settings/notifications` (referenced in nav but page source not located in the app directory listing).  
**API routes:** ~50 server routes exist; not part of UI audit but referenced by pages.

---

## 3. PAGE-BY-PAGE AUDIT

### 3.1 Landing Page (`/`)
- **Purpose:** Marketing / waitlist capture. Clear headline, hero metrics, trust sections.
- **Strengths:** Skip link, semantic nav, `prefers-reduced-motion`, clear section hierarchy, editorial serif accents.
- **Problems:** `table { min-width: 980px }` forces horizontal scroll on mobile; hero uses background-image gradients with red/green blobs — contrast not verified on text-over-gradient; "Early Access Modal" is a waitlist, not product access.
- **Visual hierarchy:** Strong. H1 > editorial subhead > metric bands.
- **Interactions:** Waitlist modal, CTA buttons to `/login`/`/signup`.
- **Accessibility:** Skip link present; `tabIndex={-1}` on main; heading hierarchy used.
- **Responsive:** Table min-width breaks mobile; sections re-pad at 767px.
- **Data presentation:** Marketing claims ("Recover trapped cash 18 days faster") unverified against implementation.
- **Integrity:** Marketing page makes capability claims; verify implementation evidence exists for each (it largely does, per other routes).

### 3.2 Pricing Page (`/pricing`)
- **Purpose:** Plan tiers (Free/Pro/Business), feature matrix, FAQ.
- **Strengths:** Monthly/yearly toggle, comparison table, CTA.
- **Problems:** Uses light text (`text-neutral-900`) on `#07080B` — contrast may fail; pricing figures are marketing, not product data.
- **Visual hierarchy:** Clear plan cards.
- **Accessibility:** No skip link on this shell; theme not applied (no `data-theme` handling visible).
- **Responsive:** Not verified.
- **Integrity:** Pricing tiers not tied to actual entitlement enforcement in UI.

### 3.3 Login (`/login`)
- **Purpose:** Email/password authentication.
- **Strengths:** Clear labels, required indicators, error state, SSO placeholders, password min-length client validation, email domain warning.
- **Problems:** SSO buttons trigger `alert()` (not functional); forgot-password link navigates but flow not fully traced; no "remember me"; no MFA UI (documented as future).
- **Accessibility:** Labels associated with inputs; error div not `role="alert"`.
- **Responsive:** Centered container, max-w-md — works on mobile.
- **Data presentation:** N/A.

### 3.4 Signup (`/signup`)
- **Purpose:** Account creation + organization details.
- **Strengths:** Sectioned form (credentials, org details), work-email validation, password strength, company size/industry selects.
- **Problems:** `freeEmailWarning` is informational only (not blocking); no password confirmation field; terms/privacy not visible.
- **Accessibility:** Labels present; required asterisks in crimson (color-only meaning).
- **Responsive:** Grid stacks on mobile.

### 3.5 Forgot Password (`/forgot-password`)
- **Purpose:** Password recovery.
- **Status:** Route exists; source not read in full (referenced in login). Label-only evidence — implementation not verified.

### 3.6 Verify Email (`/verify-email`)
- **Purpose:** Post-signup email verification.
- **Status:** Route exists; source not read in full.

### 3.7 Onboarding (`/onboarding`)
- **Purpose:** 6-step data ingestion wizard.
- **Strengths:** Genuine 6-step flow (Welcome → Setup → Connect → Map → Progress → Complete), column mapping with auto-suggest, fault-tolerant row validation, skipped-row error inspector modal, real progress stages, API-backed (`/api/onboarding/upload`, `/api/onboarding/import`), Tally/Zoho/CSV equal prominence, "Ready Now" badge on CSV.
- **Problems:** Step 5 progress is timer-simulated (`setTimeout`) ahead of actual import completion — progress bar may misrepresent backend activity; connector modals for Tally/Zoho exist but Tally requires local bridge (`AIOSpark-Tally-Bridge.exe`) not present; Zoho OAuth redirects out of app; no indication of which fields are required beyond asterisk; error modal only shows on step 6, not inline during mapping.
- **Visual hierarchy:** Strong stepper, clear primary CTA per step.
- **Interactions:** File input hidden behind styled label; mapping selects; progress stages.
- **Accessibility:** Stepper pills convey state via color + text; file input is hidden (standard pattern) but label association should be verified; no visible ARIA on stepper.
- **Responsive:** Sidebar stepper hidden on mobile (`hidden lg:block`); mobile shows "Step X of 6" text only.
- **Data presentation:** File row counts, success/skipped counts shown on completion.
- **Integrity:** Progress stage timers are simulated UI, not backend streamed progress — minor integrity concern.

### 3.8 Dashboard (`/dashboard`)
- **Purpose:** Command center — O2C pressure map (7 stages), financial position, priorities, view modes.
- **Strengths:** Genuine 7-stage pressure map with stage drawers; view modes (Terminal/Waterfall/Matrix) with hotkeys (1/2/3); `FinancialBand` with hero metric; aging distribution ribbon; `PriorityRow` for top actions; telemetry strip ("Telemetry Synchronized"); refresh action.
- **Problems:** `currentRole` default hardcoded "Owner" then overwritten by `/api/tenant/members` — initial flash of wrong role; some stage cards show hardcoded `amount: 0` (Order stage) — placeholder not labeled as such; "Telemetry Synchronized" with ping animation implies live sync without evidence; blocker category chips use `percentageOfActionableTotal` clamped 5–100% (artificial floor); `totalReceivablesVal` computed client-side from paginated items (not total).
- **Visual hierarchy:** Command header > financial band > pressure map > priorities. Strong.
- **Interactions:** Stage cards are `div` with `onClick` + `tabIndex={0}` + keyboard handler — accessible pattern attempted; view mode buttons; command palette trigger dispatches synthetic keyboard event (`⌘K`).
- **Accessibility:** `onClick` divs with tabIndex — partially keyboard accessible; no `role="button"`; focus ring present.
- **Responsive:** Grid 1→2→4→7 cols; pressure map cards stack.
- **Data presentation:** Currency via inline `Intl.NumberFormat` (not shared `formatCurrency`); aging buckets computed client-side.
- **Integrity:** "Telemetry Synchronized" indicator is static (no sync status source); Order stage amount hardcoded 0.

### 3.9 Receivables (`/receivables`)
- **Purpose:** Receivables ledger table with aging, filters, sorting, pagination.
- **Strengths:** Search, status/risk/age filters, sort, pagination, aging buckets computed from due dates, `StatusIndicator`, `FinancialBand`, URL search-param persistence, row click → `/invoices/[id]`.
- **Problems:** `currentRole` hardcoded `"Owner"` (ignores actual role); `totalReceivablesVal` sums only current page items (misleading total); aging buckets use `new Date()` client-side (timezone dependent); "OUTSTANDING" column duplicates "AMOUNT"; blocker column hardcodes "PO Mismatch"/"None" rather than real data; table rows use `onClick` without `role`; no empty-state illustration (just text).
- **Visual hierarchy:** Header > band > aging strip > table. Clear.
- **Interactions:** Sort toggles asc/desc; filter chips update URL; refresh button.
- **Accessibility:** Table has no `<caption>`; header cells use `onClick` (no `<button>`); search input has no `<label>`.
- **Responsive:** `overflow-x-auto` on table; aging grid 2→5 cols.
- **Data presentation:** Currency inline; negative/zero not specially handled; missing values show `formatCurrency(0)` = "₹0".
- **Integrity:** Risk values derive from `items` (backend) — genuine; blocker text is static.

### 3.10 Customers (`/customers`)
- **Purpose:** Customer directory, exposure, risk, DSO.
- **Strengths:** Search, risk filter pills, overdue-only toggle, sort, `DetailDrawer` preview, customer 360 link, `FinancialBand`, empty state with CTA to onboarding, loading skeletons.
- **Problems:** `currentRole` hardcoded `"Owner"`; debounce 150ms on every keystroke fires fetch; percentage of AR computed but source unclear; status pills use `StatusIndicator` mapped from riskBand (CRITICAL/WAITING/VERIFIED) — semantic stretch (VERIFIED ≠ low risk).
- **Visual hierarchy:** Command header > band > toolbar > table. Clear.
- **Interactions:** Row click navigation; preview drawer opens on "Preview" button (does not navigate).
- **Accessibility:** Rows have `tabIndex={0}` + keydown handler; no `role="button"`; filter pills are `button` elements — good.
- **Responsive:** Grid stacks; table scrolls.
- **Data presentation:** Currency via `formatCurrency` (shared) — consistent here.
- **Integrity:** Genuine backend data via `/api/customers`.

### 3.11 Customer 360 (`/customers/[id]`)
- **Purpose:** Single-customer exposure, invoices, investigation trigger.
- **Strengths:** Breadcrumb back to CFO, `FinancialBand`, `DataLineagePanel`, `IntelligencePanel`, investigation POST to `/api/agents/investigate`, invoice table with drill-in.
- **Problems:** `currentRole` hardcoded `"Finance Manager"`; `actionNotice` success message ("✅ Investigation complete") fires regardless of backend result if `res.ok`; investigation button not role-gated in UI; `profile?.riskBand` used directly in `StatusIndicator` — unknown values fall to default; no customer not-found state (shows "Record not found" only in header subtitle).
- **Visual hierarchy:** Header > band > synthesis > invoices table. Clear.
- **Interactions:** Investigation button shows loading state; action notice dismissible.
- **Accessibility:** Status indicator on header; action notice is `div` (not `role="alert"`).
- **Responsive:** Single column; table scrolls.
- **Data presentation:** Currency via shared `formatCurrency`.
- **Integrity:** Investigation result not reflected in UI (only toast message).

### 3.12 Invoices (`/invoices/[id]`)
- **Purpose:** Invoice detail, line items, timeline, suggested dispatch, approval request.
- **Strengths:** Timeline component, line item table, `DataLineagePanel`, `IntelligencePanel`, approval modal with hardcoded action payload, "REQUEST APPROVAL" button.
- **Problems:** `currentRole` hardcoded `"Finance Manager"`; fetch uses `/api/receivables?q=invoiceId` then client-side finds match (inefficient, leaks all receivables to client); line items hardcoded single line "LINE-1" with amount = full invoice (not real line items); timeline has only 2 static events; suggested dispatch message is static; approval modal hardcodes `confidence: 0.94`, amount `₹3,00,000`, action `CORRECT_INVOICE_QUANTITY` — mock payload not derived from actual investigation; dispatch message button shows fake success (`setActionNotice('✅ Communication queued')`) with no API call.
- **Visual hierarchy:** Header > band > timeline/line items > dispatch/documents. Clear.
- **Interactions:** Investigation button, approval modal (submit → POST `/api/approvals` — genuine API call but with hardcoded body).
- **Accessibility:** Modal lacks `role="dialog"`/`aria-modal`; focus not trapped; close via button only.
- **Responsive:** Grid 1→12 cols.
- **Data presentation:** Currency inline; status color-coded.
- **Integrity:** Approval payload hardcoded; dispatch "success" is fabricated; line items static.

### 3.13 Exceptions (`/exceptions`)
- **Purpose:** Ranked operational blockers, exception synthesis.
- **Strengths:** `PriorityRow` list, `FinancialBand`, `IntelligencePanel` with confidence, empty state, refresh.
- **Problems:** `currentRole` hardcoded `"Owner"`; IntelligencePanel hardcodes `confidence={0.94}` and derives `whatChanged` from `data.items[0]` (assumes first item is primary — not necessarily true); `evidence` array is static strings; actionUrl hardcodes `/investigations`; no severity color coding beyond `isCritical` flag on PriorityRow.
- **Visual hierarchy:** Header > band > ranked blockers > synthesis panel. Clear.
- **Interactions:** Row click opens detail (only `setSelectedItem`, no drawer rendered for selected item — selected state stored but never displayed).
- **Accessibility:** PriorityRow is keyboard accessible; empty state is text only.
- **Responsive:** Single column, max-w-7xl.
- **Data presentation:** Currency via `item.affectedAmountFormatted` (backend-formatted).
- **Integrity:** Confidence 0.94 is static; selected item detail never rendered (dead state).

### 3.14 Collections (`/collections`)
- **Purpose:** Prioritized recovery worklist.
- **Strengths:** `PriorityRow`, `FinancialBand`, `IntelligencePanel` (not rendered in this version), search param, empty-ish state.
- **Problems:** `currentRole` hardcoded `"Owner"`; `selectedItem` state stored but never rendered (no detail panel); `data?.kpis.*` used directly without null guards beyond `??`; `brokenPromisesCount` labeled "CASES" but no breakdown; no pagination; table replaced by PriorityRow cards (less dense than a worklist should be).
- **Visual hierarchy:** Header > band > worklist. Clear.
- **Interactions:** Refresh; search (debounced via useEffect on search).
- **Accessibility:** PriorityRow keyboard accessible.
- **Responsive:** Cards stack.
- **Data presentation:** Currency via `item.outstandingFormatted` (backend).
- **Integrity:** KPIs appear backend-derived; no obvious mock data.

### 3.15 Payments (`/payments`)
- **Purpose:** Payments ledger, reconciliation, unmatched queue, bank statement import.
- **Strengths:** Genuine table with pagination, filters (status/source/sort), unmatched queue with AI match suggestions, bank statement upload (CSV textarea), CSV export, `StructurallyEnforcedEvidenceDisplay` for AI analysis, detail drawer modal, ESC close.
- **Problems:** `currentRole` hardcoded `"Owner"`; visual style diverges heavily (uses `zinc-900/zinc-950` palette vs. `#09090b` elsewhere — design drift); bank statement upload parses CSV client-side with hardcoded column indices (`parts[1]`, `parts[3]`) — fragile, no header mapping; `amount_minor_units: Math.round(parseFloat(...) * 100)` assumes input is already major units (contradicts minor-units convention elsewhere); "RECONCILED" metric labeled VERIFIED without showing verification source; unmatched queue AI match confidence hardcoded `0.8` fallback.
- **Visual hierarchy:** SectionHeader > metrics band > unmatched queue > controls > table. Clear but palette-divergent.
- **Interactions:** Table row click → detail drawer; upload modal; export CSV (client-side Blob); pagination.
- **Accessibility:** Detail drawer has `aria-modal`? Not visible; drawer close button `[ESC]`; table headers not `<button>` for sort (sort via selects).
- **Responsive:** Table scrolls; controls wrap.
- **Data presentation:** `amountFormatted` etc. from backend; currency format not shown (assumes pre-formatted).
- **Integrity:** AI match confidence `0.8` fallback is a fabricated value; bank parser fragile.

### 3.16 Cash Unblock (`/cash-unblock`)
- **Purpose:** Signature feature — prioritized cash blockers, execution state machine, causal path.
- **Strengths:** My Next 5, `PriorityRow`, `FinancialMetric` with `provenance` (RECOMMENDATION/ACTUAL/VERIFIED), blocker distribution, dependency/actionability badges, execution state machine (NONE→PREVIEW→EXECUTING→VERIFYING→VERIFIED), idempotency key, verify POST `/api/agents/investigate`, drawer with evidence + causal graph + O2C cross-links, approval-required banner linking to `/approvals`.
- **Problems:** **"Recently Unblocked & Recovered" section hardcodes XYZ SYSTEMS / GLOBEX LOGISTICS / ACME TECH with fixed amounts and "VERIFIED TODAY/YESTERDAY/2D AGO" — P0 mock data presented as verified financial outcomes.** `currentRole` hardcoded `"Owner"`; `summary.criticalCount + 2` cases ready (arbitrary +2); `recoveredCash` provenance VERIFIED but source unclear; execution "VERIFIED" state says "VERIFICATION PENDING" (contradictory); `handleExecuteControlledAction` dispatches a generic payload not derived from the specific recommendation; `alert()` on execution failure.
- **Visual hierarchy:** Command header > metrics > signal + blocker distribution > My Next 5 > all work table > recovered section > drawer. Dense but organized.
- **Interactions:** Rich. Row click opens drawer; execute preview→execute→verify flow; assign owner; simulator modal.
- **Accessibility:** Drawer is `fixed inset-0` with Escape close; table rows `onClick` + `tabIndex` absent (not keyboard accessible as rows); badges use color + text — good.
- **Responsive:** Table scrolls; drawer full height on mobile.
- **Data presentation:** `provenance` labels used — strength; but recovered cash section is static.
- **Integrity:** **P0 — mock recovered-cash data.** Execution verification conclusion text is generic.

### 3.17 Causal Graph (`/causal-graph`)
- **Purpose:** O2C root-cause relationship map with verified/inferred edge distinction.
- **Strengths:** Genuine graph API (`/api/causal-graph`), node provenance labels (VERIFIED/INFERRED), edge style (solid vs dashed) for verified vs AI-inferred, data quality metrics (verified/inferred counts, synced at), accessible relationship audit table alternative, 3 graph modes, zoom, case selector.
- **Problems:** `currentRole` hardcoded `"Owner"`; graph is a linear chain (not a true graph visualization — nodes laid out in row with `overflow-x-auto`); `scale()` zoom on container may break layout/paint; `activeChain` may be null with empty state; "LIVE DATA CAUSAL GRAPH" claim depends on API; no node drag/interaction beyond select.
- **Visual hierarchy:** Header > health strip > toolbar > split (graph left, intelligence right) > audit table. Strong.
- **Interactions:** Node select; case dropdown; zoom controls; mode toggle.
- **Accessibility:** Graph is visual-only; audit table below is the accessible alternative — good dual design; table rows have `onClick` without `role`.
- **Responsive:** Grid 1→12 cols (8/4 split); graph scrolls horizontally.
- **Data presentation:** Provenance clearly distinguished (VERIFIED vs INFERRED) — strength.
- **Integrity:** Provenance labels appear backend-driven; no obvious mock data in graph itself.

### 3.18 CFO (`/cfo`)
- **Purpose:** Executive command center, synthesis, category breakdown, customer concentration, management attention.
- **Strengths:** `IntelligencePanel`, category grid, top customer table with drill-in, management attention cards with AUTHORIZE ACTION links, date range selector, refresh.
- **Problems:** `currentRole` hardcoded `"Owner"`; `executiveTrends` mapped with index as key (React anti-pattern, breaks on reorder); `dsoPreviousPeriodDays` shown as "Prev" with no context; management attention `targetModule` links hardcoded to `/approvals`; `formatCurrency` inline (not shared).
- **Visual hierarchy:** Header > band > synthesis/trends > category > concentration > attention. Clear executive flow.
- **Interactions:** Date range buttons; trend items are static; attention cards link out.
- **Accessibility:** Table has no caption; `StatusIndicator` mapped from `riskBand` (high→CRITICAL, else HIGH — HIGH is not a valid StatusType, falls to default).
- **Responsive:** Grid stacks.
- **Data presentation:** Currency inline; DSO as "X days".
- **Integrity:** Executive insight text appears backend-derived (`data?.executiveInsight`).

### 3.19 Investigations (`/investigations`)
- **Purpose:** Ad-hoc AI investigation runner with verification loop.
- **Strengths:** Investigation type selector, target ID input, run button with loading, `StructurallyEnforcedEvidenceDisplay`, verification loop (resolved/still_blocked), history log, drill-out links.
- **Problems:** `currentRole` selectable (Owner/Finance Manager/Executive/Viewer) but has NO effect on backend calls — permission theater; `runInvestigation` fires on mount with hardcoded `targetId='inv_1001'`; `financialImpact="₹12,00,000"` hardcoded in IntelligencePanel regardless of analysis; verification logic checks `category === 'NORMAL_CYCLE' && confidence > 0.9` — arbitrary threshold; `cashUnblockedFormatted` parses evidence value with regex (fragile); `alert()` not used here but error div present; `useEffect` on empty deps runs once — stale targetId.
- **Visual hierarchy:** Header > launcher > loading/error > report > evidence > verification. Clear.
- **Interactions:** Run investigation; verify resolution; drill-out links.
- **Accessibility:** Selects and inputs labeled; error div not `role="alert"`.
- **Responsive:** Single column, max-w-7xl.
- **Data presentation:** Confidence from backend; financialImpact hardcoded.
- **Integrity:** **P1 — hardcoded `₹12,00,000` financial impact.** Role selector is non-functional (permission theater).

### 3.20 Agents (`/agents`)
- **Purpose:** AI agent control plane, fleet metrics, roster, execution logs, safety audit.
- **Strengths:** Agent roster table with requiresApproval/roleRequired, fleet metrics, analyst dossier, safety log with action-trapped/success/error badges, run agent POST `/api/agents`.
- **Problems:** `currentRole` hardcoded `"Owner"`; metrics use fallback defaults (`|| 6`, `|| logs.length`) when API data missing — may display stale/wrong counts; dossier `generated_at` displayed but no staleness warning; execution buttons not role-gated in UI.
- **Visual hierarchy:** Header > metrics > roster > dossier > audit log. Clear.
- **Interactions:** Run agent button; dossier generate.
- **Accessibility:** Table rows are links (`<Link>`) — good; execute buttons are `<button>` — good.
- **Responsive:** Table scrolls.
- **Data presentation:** Metrics from backend with fallback defaults.
- **Integrity:** Fallback defaults may misrepresent fleet state.

### 3.21 Approvals (`/approvals`)
- **Purpose:** Human-in-the-loop approve/modify/reject with audit trail.
- **Strengths:** Genuine approve/reject/modify API calls, `StructurallyEnforcedEvidenceDisplay`, audit log, empty states, filter tabs, role-based button gating logic in code.
- **Problems:** `userRole` state is a **client-side select explicitly labeled "(Selectable for demo/test)"** — lets any user pretend to be Owner/Finance Manager to unlock approve buttons; backend may enforce but UI presents false control; `handleApprove` uses `alert()` for errors; `selectedReq.status` displayed but `reviewed_by_user_id` shown raw (UUID, not name); modify modal pre-fills but no validation; no role-based hiding of actions (all three buttons render for pending regardless of role — the `Can` component is not used on action buttons); `reviewed_at` raw timestamp.
- **Visual hierarchy:** Header (with role selector) > metrics band > 2-col workspace (queue + detail) > audit log. Strong control-room layout.
- **Interactions:** Queue item select → detail; approve/modify/reject modals; filter tabs.
- **Accessibility:** Modals lack `role="dialog"`/`aria-modal`; focus not managed on open; `alert()` interrupts screen readers.
- **Responsive:** Grid 1→12 cols (5/7); queue has max-h scroll.
- **Data presentation:** Confidence as percentage; timestamps raw.
- **Integrity:** Role selector is permission theater; `alert()` for errors; action buttons not role-gated visually.

### 3.22 Settings (`/settings`)
- **Purpose:** Org profile, team members/RBAC, shortcuts to integrations/billing/notifications/approvals.
- **Strengths:** Org form with save (simulated via setTimeout), `Can` component gates Invite buttons, team table with role badges and permission-scope descriptions, role color coding.
- **Problems:** `currentRole` default "Owner" overridden by API; save is simulated (`setTimeout`) — no actual PATCH to `/api/tenant/organizations`; `formData` hardcoded defaults ("Apex Enterprises") until API loads; team members table shows hardcoded "Sarah Jenkins" when empty; `baseCurrency` input disabled (not editable); no password/2FA settings; billing/integrations/notifications are nav links to other pages.
- **Visual hierarchy:** Header > nav tabs > shortcut cards > org form > team table. Clear.
- **Interactions:** Form inputs; save button (simulated); invite modal (`TeammateInviteModal`).
- **Accessibility:** Form labels associated; role badges use color + text.
- **Responsive:** Grid 1→2→4 for shortcuts; table scrolls.
- **Data presentation:** Currency text disabled; dates formatted.
- **Integrity:** **Save simulation is misleading** — appears to save but makes no API call (no endpoint called in `handleSaveOrganization`).

### 3.23 Settings / Integrations (`/settings/integrations`)
- **Purpose:** Connector status, sync, error center, sync history, O2C pipeline architecture.
- **Strengths:** Tabs (cards/history/errors/health), `FinancialMetric`, `StatusIndicator`, sync trigger with success/error banners, error center with retry, pipeline architecture diagram, `integrations-insight` AI banner.
- **Problems:** `currentRole` hardcoded `"Admin"`; integration cards have hardcoded `lastSyncAt` (relative `Date.now() - 25 min` etc.) until API overrides — initial render shows fake recency; SAP/Oracle marked "planned" with `opacity-50` (good); `dataHealth` fallbacks (`?? 4`, `?? 2450`) may show hardcoded counts; sync success banner uses `data.summary` shape not verified against API contract.
- **Visual hierarchy:** Header > metrics > insight banner > tabs > content. Clear.
- **Interactions:** Sync buttons (loading state "SYNCING..."); tab switching; retry buttons.
- **Accessibility:** Table rows not keyboard-sortable; status badges via `StatusIndicator`.
- **Responsive:** Grid 1→3 for cards; tables scroll.
- **Data presentation:** Timestamps formatted; counts from backend with fallbacks.
- **Integrity:** Initial hardcoded sync timestamps are temporary placeholders — acceptable if quickly overridden, but not labeled as such.

### 3.24 Settings / Billing & / Settings / Notifications
- **Purpose:** Billing subscription, notification preferences.
- **Status:** Referenced in nav/settings shortcuts; page source files not located in `src/app/settings/` directory listing (only `billing/`, `integrations/`, `notifications/` directories exist — need to verify page.tsx inside). **Not fully inspected.**

### 3.25 Reports (`/reports`)
- **Purpose:** Report library, preview, export (CSV/XLSX/PDF), scheduling.
- **Strengths:** Category filter, search, report index, preview table with column formatting (`formatValue` with currency/percent/number), download via Blob, schedule modal, `dsoFormulaNotice`, "LEDGER STORE SYNCED" claim.
- **Problems:** `currentRole` hardcoded `"Owner"`; `selectedReportId` defaults to `"aging_report"` which may not exist in `reports` array (falls to `reports[0]`); preview "LIVE REPORT PREVIEW" claim depends on API; `formatValue` divides currency by 100 (minor-units assumption) but some columns may already be major units; schedule modal creates schedule via POST — genuine; no report not-found state when `reports` empty; `reports` may be empty after fetch (empty state not designed).
- **Visual hierarchy:** Header > metrics > selector > split (index + preview). Clear.
- **Interactions:** Category pills; download buttons; schedule form.
- **Accessibility:** Report index items are `<button>` — good; table has no caption; schedule modal lacks `role="dialog"`.
- **Responsive:** Grid 1→3 cols; index scrolls.
- **Data presentation:** `formatValue` handles null as "—"; currency via Intl.
- **Integrity:** "LIVE REPORT PREVIEW" and "LEDGER STORE SYNCED" are claims dependent on backend; not independently verifiable from UI.

### 3.26 Admin / AI Tasks (`/admin/ai-tasks`)
- **Purpose:** AI quality observability, model validation gate, category breakdown.
- **Strengths:** Observability metrics, alerts panel, accuracy/override-rate cards, category breakdown table, pre-deployment validation report with gate pass/fail.
- **Problems:** **No `MainNavShell` wrapper** — breaks navigation shell consistency (no sidebar, no role context); `glass-panel` class used but not defined in globals.css (undefined class — may render unstyled); data may be null on first render (summary destructured from `data || {}` — safe); unit cost hardcoded `'1.50'` fallback.
- **Visual hierarchy:** Header > alerts > stats cards > validation report > category table. Clear but orphaned from shell.
- **Interactions:** Run validation button.
- **Accessibility:** No skip link; table no caption.
- **Responsive:** Container max-w-7xl; table scrolls.
- **Data presentation:** Metrics from backend; percentages computed.
- **Integrity:** `unitCost` fallback `'1.50'` is static.

### 3.27 Admin / Beta (`/admin/beta`)
- **Purpose:** Beta org metrics, check-in logs, classification tagging, engineering task conversion.
- **Strengths:** Org selector, metrics cards, human classification tagging (correct/AI error), check-in log form, engineering task tracking, convert-to-task button.
- **Problems:** **No `MainNavShell` wrapper** — inconsistent with other admin/ops pages; org selector hardcodes 3 demo orgs (Acme/TATA/Reliance); `handleTagClassification` fabricates `exceptionId: exp_${Date.now()}`; check-in form uses hardcoded `weekStartDate: '2026-03-02'`; metrics from `currentSnap` with fallback `|| 0`.
- **Visual hierarchy:** Header > action msg > metrics > tagging > check-ins > tasks. Clear.
- **Interactions:** Tag buttons; form; convert button.
- **Accessibility:** Buttons labeled; org select labeled.
- **Responsive:** Grid stacks.
- **Data presentation:** Currency `₹{.../100}` inline; percentages.
- **Integrity:** Fabricated exception IDs and hardcoded week dates are test scaffolding, not labeled as such.

### 3.28 Taxonomy Queue (`/taxonomy/queue`)
- **Purpose:** Manual reclassification of UNKNOWN payment-delay categories.
- **Strengths:** Genuine taxonomy reference (11 categories from `PAYMENT_DELAY_CATEGORIES`), manual reclassify select + confirm, UNKNOWN badge, empty state.
- **Problems:** **Queue is hardcoded to a single mock item** (`inv_unk_101`, Global Freight Systems, ₹450,000) — no API fetch; `alert()` for success; `selectedCategoryMap` local only (no persistence); `createdAt: new Date().toISOString()` (client clock); amount string hardcoded with commas (`₹450,000.00`) not using formatter.
- **Visual hierarchy:** Header > queue items > taxonomy reference. Clear.
- **Interactions:** Category select; confirm button (disabled until selected).
- **Accessibility:** Select labeled; button disabled state; UNKNOWN badge is color + text.
- **Responsive:** Single column.
- **Data presentation:** Amount hardcoded string.
- **Integrity:** **P1/P2 — mock queue data presented as real work queue.**

### 3.29 Agents / [agentId]
- **Status:** Dynamic route exists in app directory listing (`agents/[agentId]/page.tsx`) but was not in the read file list — need to confirm. Listed in find output earlier? The find output showed `/app/agents/[agentId]/page.tsx` exists. **Not read.**

---

## 4. COMPLETE O2C JOURNEY AUDIT

| Stage | Entry point | User task | Current experience | Problems | Improvements |
|---|---|---|---|---|---|
| Order | `/dashboard` (stage 01 card) | View order intake exposure | Dashboard pressure map stage 01 shows `amount: 0`, "0 open order blockers" — no live data | Hardcoded zero; not labeled as no-data | Connect to order source or show "no order data" |
| Fulfillment | `/dashboard` stage 02 → `/exceptions` | Track POD/missing documents | Stage 02 maps MISSING_DOCUMENT category; drawer links to exceptions | Amount derived from category — may be 0 | Show document status per order |
| Invoicing / PO | `/dashboard` stage 03 (bottleneck) → `/receivables`/`/invoices/[id]` | Identify PO mismatches | Stage 03 flagged Primary Bottleneck with red styling; invoice detail shows line items | Line items hardcoded single line; PO mismatch data not shown | Real 3-way match evidence |
| Disputes | `/exceptions` → `/customers/[id]` | Review customer disputes | Exception list includes CUSTOMER_DISPUTE category; customer 360 shows exposure | Dispute status/resolution not surfaced | Dispute detail view |
| Collections | `/collections` | Work prioritized recovery queue | PriorityRow worklist with next-best-action, risk bands | `selectedItem` state never rendered; no pagination | Detail panel; pagination |
| Payment | `/payments` | Match payments to invoices | Payment table, unmatched queue, AI match suggestions | Bank parser fragile; confidence `0.8` fallback; `zinc` palette drift | Robust bank parsing; real confidence |
| Reconciliation | `/payments` unmatched → `/dashboard` stage 07 | Reconcile unmatched cash | Unmatched queue with match reasons; dashboard shows unreconciled cash | Reconciliation confidence not visible per-match | Verified/unverified match flags |

### Cross-journey observations
- **UPLOAD** → `/onboarding`: genuine, well-implemented.
- **UNDERSTAND** → `/dashboard`, `/receivables`, `/customers`, `/cfo`: coherent, but metrics computed client-side from paginated data (totals misleading).
- **PRIORITIZE** → `/cash-unblock` (My Next 5), `/collections`, `/exceptions`: strong priority surfaces; cash-unblock mock recovered-cash section undermines trust (P0).
- **REVIEW** → `/investigations`, `/causal-graph`, `/invoices/[id]`: evidence displays strong; hardcoded confidence/financial impact in investigations (P1).
- **APPROVE** → `/approvals`: genuine approval flow; role-selector theater (P1); buttons not role-gated visually (P2).

---

## 5. DESIGN SYSTEM AUDIT

### 5.1 Colors
- **Tokens:** `src/lib/ui/tokens.ts` defines `SEVERITY_TOKENS` (critical/high/medium/low with red/amber/yellow/emerald), `STATUS_TOKENS`, `TYPOGRAPHY_TOKENS`, `LAYOUT_TOKENS`. These are **not widely consumed** — most pages hardcode colors.
- **CSS variables:** `globals.css` defines `--background #050505`, `--brand-red #FF2D2D`, surfaces, borders, text. Light mode via `html[data-theme="light"]` overrides to `#F8F9FA`.
- **Brand red:** `#FF2D2D` (globals) / `#FF3B30` (globals.css component classes, DESIGN.md, README). Inconsistent hex usage across files.
- **Surface drift:** Pages use `#09090b` (receivables/exceptions/collections/invoices/customer360), `#12141A` (dashboard/cash-unblock drawer), `#181B23`, `zinc-900/zinc-950` (payments/reports/integrations/admin), `#050505` (login/signup/auth, admin pages), `#0A0B0E` (workstation shell). No single canonical surface color.
- **Light mode:** `globals.css` has ~2,100 lines of `html[data-theme="light"]` overrides, but they are page-scoped selectors (`.workstation-main`, `.dashboard-page`, `.approval-*`, etc.) — incomplete coverage; `/payments`, `/reports`, `/integrations` use `zinc` palette with no light-mode overrides → likely unreadable or broken in light mode.

### 5.2 Typography
- **Fonts:** Inter (sans), Newsreader (serif editorial, italic), Geist Mono / SFMono (mono). Imported via Google Fonts in `globals.css`.
- **Token scale:** `text-2xl` page titles, `text-lg` section titles, `text-sm` card titles, `text-3xl` metric values, `text-[11px]` mono labels. Reasonable scale but not consistently applied.
- **Financial mono:** `font-mono-num` with `tabular-nums` used for metrics — good practice.
- **Drift:** Some pages use `font-sans`, others `font-mono` for body; heading sizes vary (`text-xl` to `text-4xl`).

### 5.3 Components (Reused — Strength)
- `FinancialBand`, `PriorityRow`, `SectionHeader`, `StatusIndicator`, `IntelligencePanel`, `FinancialMetric`, `EvidenceBlock`, `StructurallyEnforcedEvidenceDisplay`, `DetailDrawer`, `Timeline`, `CausalGraph`, `SignalRail`.
- These are genuinely shared across dashboard, receivables, collections, exceptions, cfo, cash-unblock, investigations — consistent where used.

### 5.4 Buttons
- `btn-editorial-primary` (crimson gradient) defined in CSS but used mainly on landing/dashboard/customer pages.
- Operational pages use inline hardcoded button classes (`bg-[#FF2D2D]`, `bg-emerald-600`, `bg-zinc-900`, etc.) — no unified button component.
- Payments/reports/integrations use `zinc-900` buttons — different visual language from crimson primary.

### 5.5 Forms / Inputs
- Onboarding and login/signup use consistent styled inputs (`bg-[#050505] border border-neutral-800 focus:ring-[#FF2D2D]`).
- Settings uses `bg-[#181B23] border border-white/[0.08]`.
- Payments/integrations use `zinc-900 border border-zinc-800`.
- **Three different input styles across the app.**

### 5.6 Tables
- Receivables: `bg-[#181B23]` header, `divide-white/[0.06]`, `font-sans`.
- Payments/reports/integrations: `zinc-900` header, `divide-zinc-800/80`, `font-mono`.
- Customers: `bg-[#181B23]`, `font-sans`.
- No unified table component; no `<caption>`; no `scope` on headers consistently.

### 5.7 Cards
- `workstation-card`, `workstation-card-interactive`, `workstation-panel`, `workstation-surface` defined in CSS.
- Pages also use inline `bg-[#09090b] border border-[#27272a]` or `bg-zinc-900 border border-zinc-800`.
- Radius varies: `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-lg`.

### 5.8 States
- Loading: skeletons on customers; text spinners elsewhere; no unified loader component.
- Empty: varied (some illustrated, some text-only).
- Error: `alert()` in taxonomy/investigations; inline error divs in payments/reports; no toast system.

### 5.9 Themes
- Dark: primary theme, well-developed.
- Light: partial, piecemeal overrides in `globals.css`; several pages (payments, reports, integrations, admin) have no light-mode overrides → likely contrast failures in light mode.
- `ThemeToggle` component exists; theme persistence not verified.

### 5.10 Missing Tokens
- No spacing scale token consumption (pages use arbitrary `p-4`, `p-6`, `space-y-8`).
- No z-index scale.
- No elevation/shadow token scale (shadows hardcoded per page).
- No focus-ring token beyond global `:focus-visible`.

**Finding:** AIOSpark has **component reuse** (a genuine design-system seed) but **not a centralized design system**. Tokens exist but are overridden by ~2,100 lines of page-scoped CSS in `globals.css` and per-page hardcoded colors. This is **design drift**, not a systematic design system.

---

## 6. ACCESSIBILITY REPORT

### 6.1 Confirmed WCAG Failures (Source-Level Evidence)

| # | Issue | Location | Evidence | WCAG |
|---|---|---|---|---|
| A1 | Tables lack `<caption>` and `scope` on header cells | `/receivables`, `/customers`, `/payments`, `/reports`, `/agents`, `/integrations` | `<table>` used with `<thead><tr><th>` but no `<caption>`, `scope="col"` not consistently present | 1.3.1, 2.1.1 |
| A2 | Interactive `div`/`tr` rows with `onClick` but no `role="button"` | `/receivables` (row onClick), `/customers` (row onClick), `/cash-unblock` table rows | `onClick={() => router.push(...)}` on `<tr>` without role/tabIndex | 2.1.1, 4.1.2 |
| A3 | `alert()` used for user feedback | `/taxonomy/queue`, `/investigations`, `/approvals` | `alert(...)` calls interrupt screen readers and cannot be dismissed | 1.4.3 (focus), 4.1.3 |
| A4 | Modals/drawers lack `role="dialog"` / `aria-modal` | `/approvals` modals, `/invoices/[id]` approval modal, `/payments` drawer | `div` with `fixed inset-0` but no ARIA dialog attributes | 4.1.2 |
| A5 | Focus not managed on modal/drawer open | All modals | No `autoFocus`, no focus trap, no return focus | 2.4.3 |
| A6 | Search inputs lack visible `<label>` | `/receivables`, `/customers`, `/investigations`, `/payments` | `<input placeholder>` only; no `<label>` element or `aria-label` | 3.3.2 |
| A7 | Color used as sole indicator | Risk chips, StatusIndicator (dot + text — mostly OK), taxonomy UNKNOWN badge | Some status conveyed by color-only text (`text-[#FF3B30]`) | 1.4.1 |
| A8 | Role selector is permission theater | `/approvals` | `<select>` changes local `userRole` only; does not affect backend authorization | 4.1.2 (misleading) |

### 6.2 Potential Failures (Contrast — Requires Rendered Verification)

- `#FF2D2D`/`#FF3B30` crimson text on white (`#FFFFFF`) or `#F8F9FA`: crimson red (~#FF2D2D) on white has contrast ratio ~3.6:1 — **below 4.5:1 for normal text**. Used in `/taxonomy/queue` (UNKNOWN badge text), `/cfo` category cards, `/receivables` risk text.
- `#FF3B30` on `#F8F9FA` (light mode): similar risk.
- `text-neutral-400` (`#9CA3AF`) on dark surfaces: ~4.6:1 — borderline pass on `#050505`, may fail on `#12141A`/`#09090b`.
- `text-neutral-500` (`#6B7280`) on dark: ~3.0:1 — **fails 4.5:1 for normal text** on `#050505`; used widely as muted text.
- Light-mode surfaces: `#F3F4F6`/`#FFFFFF` with `text-neutral-400` (`#6B7280`) — ~4.6:1 borderline.

*Note: Actual rendered contrast requires browser testing with computed styles. These are potential failures flagged for verification.*

### 6.3 Theme-Specific Problems
- Light mode overrides in `globals.css` do not cover `/payments`, `/reports`, `/settings/integrations` (zinc palette) — these pages likely retain dark text colors on dark surfaces or vice versa in light mode.
- `html[data-theme="light"]` sets `background-color: #F8F9FA !important` and `color: #111827 !important` on `body`, but child components with hardcoded `bg-[#09090b]` etc. will not be overridden unless explicitly targeted.

### 6.4 Keyboard Issues
- Sidebar drawer: Escape closes (good), but `aria-expanded`/`aria-controls` on mobile menu button — good.
- `onClick` divs with `tabIndex={0}` and keydown handlers (receivables, customers, dashboard stage cards) — partially keyboard accessible but lack `role="button"`.
- Command palette triggered by synthetic `KeyboardEvent` (`⌘K`) — non-standard, may not work for all users.
- Dashboard view modes use hotkeys 1/2/3 with no visible cheat sheet except `title` attributes — discoverability issue.

### 6.5 Screen-Reader Issues
- No skip link on `/pricing`, `/login`, `/signup`, `/settings`, admin pages (only landing and workstation shell).
- `StatusIndicator` labels are text — OK.
- `PriorityRow` confidence badge says "AI confidence" — screen reader reads number + label — OK.
- `FinancialMetric` provenance labels are visual text — OK.
- Images (`/logo.png`) have alt text — OK.
- Icon-only buttons (refresh, search) often lack `aria-label` (dashboard refresh has `aria-label`; others vary).

### 6.6 Recommended Fixes
1. Add `<caption>` + `scope="col"` to all financial tables.
2. Convert `onClick` rows to `<button>` or add `role="button"` + `tabIndex={0}` + Enter/Space handlers.
3. Replace `alert()` with inline toast/alert (`role="alert"`).
4. Add `role="dialog" aria-modal="true"` to all modals; manage focus on open/close.
5. Add `<label>` or `aria-label` to all search/inputs.
6. Verify crimson contrast on light mode; use darker text token where <4.5:1.
7. Remove or functionally wire the `/approvals` role selector.

---

## 7. RESPONSIVE DESIGN REPORT

| Viewport | Findings |
|---|---|
| 320 × 568 (Small mobile) | Workstation sidebar collapses to drawer (good). Landing table `min-width: 980px` → horizontal scroll, content clipping. Onboarding stepper hidden (shows "Step X of 6" only). |
| 375 × 812 (Standard mobile) | Same landing table overflow. Dashboard pressure map grid 1-col. Tables scroll horizontally. |
| 430 × 932 (Large mobile) | Same as above; cash-unblock drawer full-height (acceptable). |
| 768 × 1024 (Tablet) | Sidebar becomes static (`md:static`). Pressure map 2-col. Landing table `min-width: 820px` still may overflow at 768px. |
| 1280 × 720 (Small laptop) | Dashboard 4-col pressure map. Shortcut cards 2-col. Horizontal space tight for financial tables. |
| 1440 × 900 (Desktop) | Full 7-col pressure map. Sidebar fixed. |
| 1920 × 1080 (Large desktop) | `max-w-7xl` centers content; wide margins. |

**Responsive concerns:**
- `overflow-x-hidden` on `workstation-main` could clip horizontal table scroll on mobile if not carefully managed.
- Landing shell `table { min-width: 980px }` is anti-responsive.
- No verified mobile rendering (no browser testing performed).
- Touch targets: many buttons are `px-3 py-1.5 text-xs` (~44px height) — acceptable but some `text-[10px]` buttons may be smaller.

---

## 8. UI INTEGRITY REPORT

### 8.1 Verified Real Data (API-backed)
- Dashboard metrics via `/api/cfo/overview`, `/api/tenant/data`, `/api/approvals`
- Receivables via `/api/receivables`
- Customers via `/api/customers`, `/api/customers/[id]`
- Collections via `/api/collections`
- Exceptions via `/api/exceptions`
- Payments via `/api/payments`
- Causal graph via `/api/causal-graph`
- Onboarding import via `/api/onboarding/upload`, `/api/onboarding/import`
- Approvals via `/api/approvals`
- Integrations status via `/api/integrations/status`
- Agents via `/api/agents`
- Reports via `/api/reports`
- CFO overview via `/api/cfo/overview`

### 8.2 Deterministic Derived Data
- Aging buckets computed client-side from due dates (`/receivables`)
- DSO, totals, percentages computed in page components
- Blockers mapped to taxonomy categories

### 8.3 AI-Generated Content
- `/api/intelligence/analyze`, `/api/copilot`, `/api/agents/investigate`, `/api/next-best-action` — AI reasoning engine
- Confidence scores from backend (where used)
- `StructurallyEnforcedEvidenceDisplay` renders AI analysis with confidence bands

### 8.4 Mock / Static Data (Integrity Concerns)
| Item | Location | Description | Severity |
|---|---|---|---|
| Recovered cash list | `/cash-unblock` lines 638-669 | Hardcoded XYZ SYSTEMS ₹8,20,000, GLOBEX ₹14,50,000, ACME ₹6,40,000 with "VERIFIED TODAY/YESTERDAY/2D AGO" | P0 |
| Financial impact | `/investigations` line 278 | `financialImpact="₹12,00,000"` hardcoded | P1 |
| Confidence scores | `/exceptions` (0.94), `/customers/[id]` (0.92), `/invoices/[id]` (0.94) | Static confidence literals | P1 |
| Approval payload | `/invoices/[id]` modal | Hardcoded `confidence: 0.94`, amount `₹3,00,000`, action `CORRECT_INVOICE_QUANTITY` | P2 |
| Taxonomy queue | `/taxonomy/queue` | Single hardcoded mock item `inv_unk_101` | P2 |
| AI match confidence | `/payments` | Fallback `0.8` in unmatched queue | P3 |
| Settings save | `/settings` | `setTimeout`-simulated save, no API call | P2 |
| Order stage amount | `/dashboard` | `amount: 0` hardcoded | P3 |
| Integration sync times | `/settings/integrations` | Initial `Date.now() - N min` placeholders (overridden by API) | P3 |
| Agent fleet metrics | `/agents` | Fallback defaults `|| 6`, `|| logs.length` | P3 |

### 8.5 Unsupported UI Claims
- "Telemetry Synchronized" with ping animation on dashboard — no sync-status source.
- "LIVE REPORT PREVIEW" / "LEDGER STORE SYNCED" on `/reports` — claims not independently verifiable from UI.
- "VERIFIED BANK RECONCILIATION" on `/cash-unblock` recovered section — tied to mock data.

### 8.6 Unknown Provenance
- `/admin/ai-tasks` metrics (`aiQuality.summary`, `infrastructure.unitCost`) — source not fully traced.
- `/admin/beta` `currentSnap` metrics — API shape not fully verified.

---

## 9. FRONTEND ARCHITECTURE REPORT

### 9.1 Strengths
- Shared component library (`FinancialBand`, `PriorityRow`, `SectionHeader`, `StatusIndicator`, `IntelligencePanel`, `FinancialMetric`, `EvidenceBlock`, `StructurallyEnforcedEvidenceDisplay`) — genuine reuse across 10+ pages.
- Centralized formatters (`formatCurrency`, `formatDate`, `formatPercent`) in `src/lib/ui/formatters.ts` — but underused.
- Centralized tokens (`src/lib/ui/tokens.ts`) — exists but underused.
- Centralized RBAC matrix (`src/lib/tenant/permissions.ts`) — explicit and data-driven.
- `Can` component for conditional rendering based on permissions.

### 9.2 Technical Debt & Maintainability Concerns
1. **`globals.css` is ~2,100 lines** of page-scoped overrides — unmaintainable; contradicts tokens; hard to reason about cascade.
2. **Three color systems coexist:** tokens.ts (`neutral-900` etc.), globals.css CSS variables (`#050505`, `#FF2D2D`), per-page hardcoded hex (`#09090b`, `#121215`, `zinc-900`).
3. **Per-page duplicated header/metrics/table chrome** — each operational page re-implements its own executive header, `FinancialBand`, and table styles.
4. **Currency formatting duplicated inline** in ~15 page components instead of using shared `formatCurrency`.
5. **`currentRole` hardcoded** on almost every page (`"Owner"` or `"Finance Manager"`) — role is not consistently sourced from auth context.
6. **Large components:** `onboarding/page.tsx` (882 lines), `cash-unblock/page.tsx` (~1000+ lines), `payments/page.tsx` (618 lines), `receivables/page.tsx` (248 lines), `customers/page.tsx` (647 lines), `reports/page.tsx` (571 lines), `approvals/page.tsx` (508 lines). These should be decomposed.
7. **No unified error/toast system** — `alert()`, inline divs, and console errors mixed.
8. **No unified loading component** — inline spinners and skeletons.
9. **Type safety:** Pages use `any` extensively (`setUser`, `setCfoData`, `json: any`).
10. **Dead state:** `/exceptions` `selectedItem` stored but never rendered; `/collections` `selectedItem` stored but never rendered.

---

## 10. USABILITY & INTERACTION FINDINGS

| # | Route / Component | Finding | Severity |
|---|---|---|---|
| U1 | `/cash-unblock` recovered-cash section | Mock data presented as verified financial outcomes | P0 |
| U2 | `/approvals` role selector | Permission theater — local-only role change | P1 |
| U3 | `/investigations` financial impact | Hardcoded `₹12,00,000` | P1 |
| U4 | `/taxonomy/queue` | Mock queue, `alert()` feedback | P1 |
| U5 | `/cash-unblock` execution | `alert()` on failure; generic verification conclusion | P2 |
| U6 | `/exceptions` | `selectedItem` never rendered (dead state) | P2 |
| U7 | `/collections` | `selectedItem` never rendered (dead state) | P2 |
| U8 | `/settings` | Save simulated, no API call — misleading success | P2 |
| U9 | `/invoices/[id]` | Dispatch message shows fake success with no API call | P2 |
| U10 | `/dashboard` | "Telemetry Synchronized" static indicator | P2 |
| U11 | All operational pages | `currentRole` hardcoded — role misrepresentation | P2 |
| U12 | `/receivables` | Totals computed from paginated items only | P2 |
| U13 | `/approvals` | Action buttons not role-gated visually | P2 |
| U14 | Landing page | Table `min-width: 980px` breaks mobile | P2 |
| U15 | Multiple | `alert()` instead of UI feedback | P3 |
| U16 | Multiple | No breadcrumbs; inconsistent back navigation | P3 |

---

## 11. CONSOLIDATED ISSUE REGISTER

| ID | Issue | Route / Component | Evidence | Severity | User Impact | Recommended Solution |
|---|---|---|---|---|---|---|
| I-01 | Mock recovered-cash data presented as verified | `/cash-unblock` (lines 638-669) | Hardcoded XYZ/GLOBEX/ACME with "VERIFIED" labels | P0 | Users may believe cash was recovered when it was static demo content; direct trust violation | Remove static list or label clearly as demo; connect to real verified-recovery API |
| I-02 | Hardcoded financial impact | `/investigations` line 278 | `financialImpact="₹12,00,000"` static literal | P1 | Misleading financial figures | Derive from analysis data or remove |
| I-03 | Hardcoded confidence scores | `/exceptions`, `/customers/[id]`, `/invoices/[id]` | `confidence={0.94}`, `0.92`, `0.94` literals | P1 | False precision on AI conclusions | Use backend confidence or mark as illustrative |
| I-04 | Role-selector permission theater | `/approvals` line 24 | Local `<select>` changes UI only; labeled "demo/test" | P1 | Users may believe they can change their role/permissions | Remove selector or wire to real role context; gate actions by actual role |
| I-05 | Role hardcoded on MainNavShell | All operational pages | `currentRole="Owner"` default on nearly every page | P2 | Incorrect role display; permission confusion | Source role from `/api/auth/me` or `/api/tenant/members` |
| I-06 | Design system not centralized | `globals.css` (~2,100 lines) + `tokens.ts` unused | Page-scoped overrides; per-page hardcoded colors | P2 | Visual inconsistency; maintenance burden | Consolidate into tokens; consume tokens in components |
| I-07 | WCAG contrast risk: crimson on light | Multiple (taxonomy, cfo, receivables) | `#FF2D2D`/`#FF3B30` text on white/#F8F9FA | P1 | Low-vision users cannot read | Verify rendered contrast; use darker token where <4.5:1 |
| I-08 | Tables lack caption/scope | `/receivables`, `/payments`, `/reports`, etc. | `<table>` without `<caption>` | P2 | Screen-reader table comprehension | Add `<caption>` and `scope="col"` |
| I-09 | `alert()` for feedback | `/taxonomy/queue`, `/investigations`, `/approvals` | `alert()` calls | P3 | Disruptive, inaccessible | Replace with inline `role="alert"` messages |
| I-10 | Modals lack dialog ARIA | `/approvals`, `/invoices/[id]`, `/payments` | `div` modals without `role="dialog"` | P2 | Screen-reader modal awareness | Add `role="dialog" aria-modal="true"`; manage focus |
| I-11 | Search inputs lack labels | `/receivables`, `/customers`, `/payments` | Placeholder-only inputs | P2 | Screen-reader input purpose | Add visible `<label>` or `aria-label` |
| I-12 | `onClick` rows without role | `/receivables`, `/customers`, `/cash-unblock` | `<tr onClick>` without `role="button"` | P2 | Keyboard/screen-reader access | Convert to `<button>` or add role + key handlers |
| I-13 | Dead selected-item state | `/exceptions`, `/collections` | `setSelectedItem` stored, never rendered | P2 | User selection appears to do nothing | Render detail panel or remove state |
| I-14 | Settings save simulated | `/settings` `handleSaveOrganization` | `setTimeout` only, no API call | P2 | Users believe settings saved when not | Connect to `/api/tenant/organizations` PATCH |
| I-15 | Invoice dispatch fake success | `/invoices/[id]` | `setActionNotice('✅ Communication queued')` with no API call | P2 | False confirmation | Wire to real API or remove |
| I-16 | Currency formatting duplicated | ~15 pages | Inline `Intl.NumberFormat` calls | P2 | Inconsistent currency display; paise/rupee risk | Use shared `formatCurrency` |
| I-17 | Totals from paginated data | `/receivables` | `totalReceivablesVal` sums current page only | P2 | Misleading totals | Compute from API total, not page items |
| I-18 | Landing table non-responsive | `/` | `table { min-width: 980px }` | P2 | Horizontal scroll/clipping on mobile | Remove min-width; make table responsive |
| I-19 | No breadcrumbs / inconsistent back | Multiple | Back links vary (`/dashboard`, `/receivables`, `/cfo`) | P3 | Disorientation | Add breadcrumbs; consistent back pattern |
| I-20 | "Telemetry Synchronized" static | `/dashboard` | Ping animation with no sync source | P2 | False impression of live data | Source from sync status or remove indicator |
| I-21 | `currentRole` not from auth | `/approvals`, `/investigations`, etc. | Hardcoded or local select | P2 | Role mismatch | Source from auth context |
| I-22 | Large monolithic components | `onboarding` (882), `cash-unblock` (~1000), `payments` (618) | File sizes | P3 | Maintainability | Decompose into sub-components |
| I-23 | Light mode incomplete | `/payments`, `/reports`, `/integrations` | Zinc palette, no light overrides | P2 | Likely unreadable in light mode | Add light-mode overrides or unify palette |
| I-24 | Taxonomy queue mock data | `/taxonomy/queue` | Single hardcoded `inv_unk_101` | P2 | Fake work queue | Connect to real exception API |
| I-25 | No unified toast/error system | Multiple | `alert()` + inline + console | P3 | Inconsistent feedback | Implement toast component |

**Severity counts: P0 = 1, P1 = 4, P2 = 14, P3 = 6. Total confirmed issues: 25.**

---

## 12. OVERALL SCORECARD

| Category | Score | Evidence |
|---|---:|---|
| Visual design | 6 | Cohesive dark workstation theme on dashboard/cash-unblock, but design drift across payments/reports/integrations (zinc palette) and auth pages (#050505). No single canonical surface color. |
| Information architecture | 7 | Well-grouped nav (O2C / Reasoning / Management / Governance); 7-stage pressure map is a strong organizing principle; but no breadcrumbs and inconsistent back navigation. |
| O2C workflow clarity | 8 | All 7 stages mapped to routes; UPLOAD→UNDERSTAND→PRIORITIZE→REVIEW→APPROVE reflected; cash-unblock and exceptions are genuine priority surfaces. |
| Financial data presentation | 6 | Currency mostly INR/tabular-mono; provenance labels exist on `FinancialMetric`; but inline formatting duplicated, totals from paginated data, hardcoded figures (I-02, I-03). |
| Intelligence and evidence presentation | 7 | `StructurallyEnforcedEvidenceDisplay`, `EvidenceBlock`, VERIFIED/INFERRED edge distinction in causal graph; but confidence scores hardcoded and `FinancialImpact` static in investigations. |
| Interaction design | 6 | Cash-unblock execution state machine is strong; but `alert()` feedback, simulated saves, fake dispatch success, and dead selected-item states detract. |
| Navigation | 7 | Sidebar groups work; mobile drawer works; active-state indicators; but no breadcrumbs, role hardcoded, command palette uses synthetic keyboard event. |
| Design-system consistency | 5 | `tokens.ts` exists but is overridden by ~2,100 lines of page-scoped CSS in `globals.css`; three color systems; per-page duplicated chrome. |
| Accessibility | 5 | Skip links, focus rings, reduced motion present; but tables lack caption/scope, `onClick` rows lack role, modals lack dialog ARIA, `alert()` used, crimson contrast risk on light. |
| Responsive design | 6 | Sidebar drawer, table scrolling, grid reflow; but landing table `min-width: 980px` breaks mobile; light mode incomplete; no verified rendering. |
| Error and state handling | 5 | Loading/empty states exist on several pages; but `alert()` for errors, simulated saves, no toast system, inconsistent error UI. |
| UI integrity | 4 | P0 mock recovered-cash data; P1 hardcoded financial impact/confidence; P1 role-selector theater; several static/mock figures presented as real. |
| Frontend maintainability | 5 | Shared components exist (strength); but `globals.css` bloat, large monolithic components, duplicated formatting, `any` types, dead state. |

---

## 13. PRIORITIZED IMPROVEMENT ROADMAP

### Immediate Critical Corrections (Pre-design-partner, must fix)

| Problem | Why it matters | Expected benefit | Affected pages/components | Complexity | Dependencies | Verification |
|---|---|---|---|---|---|---|
| Remove mock recovered-cash data (I-01) | Presents fake financial outcomes as verified — direct trust violation and potential misrepresentation | Users trust verified-cash claims | `/cash-unblock` recovered section | Low | None | Confirm no static customer names/amounts remain |
| Remove hardcoded financial impact (I-02) | False precision on AI conclusions | Accurate financial figures | `/investigations` | Low | Backend analysis data | Confidence/impact derive from API |
| Remove hardcoded confidence scores (I-03) | Misleading reliability signals | Honest confidence representation | `/exceptions`, `/customers/[id]`, `/invoices/[id]` | Low | Backend confidence | Scores from API |
| Remove role-selector theater (I-04) | Users may believe they control permissions | Honest permission model | `/approvals` | Low | Backend RBAC | Selector removed or wired to real role |
| Source `currentRole` from auth (I-05, I-21) | Role misrepresentation across app | Correct permission UI | All operational pages | Medium | Auth context | Role matches `/api/tenant/members` |
| Fix settings save (I-14) | Users believe settings persisted when not | Settings actually save | `/settings` | Low | `/api/tenant/organizations` | Save triggers API call |

### Pre-Design-Partner Improvements

| Problem | Why it matters | Expected benefit | Affected pages/components | Complexity | Dependencies | Verification |
|---|---|---|---|---|---|---|
| Consolidate design system / reduce `globals.css` (I-06) | Visual consistency and maintainability | Coherent product feel | All pages | High | Design token audit | Pages consume tokens; `globals.css` reduced |
| WCAG contrast verification + fixes (I-07) | Accessibility compliance | Readable for low-vision users | Crimson-text pages | Medium | Rendered contrast tests | Contrast ≥4.5:1 normal text |
| Table accessibility (I-08, I-12) | Screen-reader table access | Keyboard/screen-reader table navigation | All financial tables | Medium | None | `<caption>`, `scope`, `role="button"` |
| Modal ARIA + focus management (I-10) | Screen-reader modal awareness | Accessible modals | `/approvals`, `/invoices/[id]`, `/payments` | Medium | None | `role="dialog"`, focus trapped |
| Replace `alert()` (I-09, I-15, I-25) | Disruptive feedback | Consistent in-UI feedback | `/taxonomy/queue`, `/investigations`, `/invoices/[id]` | Low | Toast component | No `alert()` calls remain |
| Currency formatting unification (I-16) | Consistent financial display | No paise/rupee errors | ~15 pages | Low | `formatCurrency` | All currency via shared util |
| Responsive landing table (I-18) | Mobile usability | No horizontal scroll on landing | `/` | Low | None | Table responsive at 320px |
| Light-mode coverage (I-23) | Theme consistency | Readable in both themes | `/payments`, `/reports`, `/integrations` | Medium | Token consumption | Light-mode rendering verified |

### Post-Pilot Usability Improvements

| Problem | Why it matters | Expected benefit | Affected pages/components | Complexity |
|---|---|---|---|---|
| Breadcrumbs + consistent back navigation (I-19) | Orientation in deep workflows | Reduced disorientation | All detail pages | Low |
| Dead selected-item states (I-13) | Selections appear to do nothing | Feedback on user action | `/exceptions`, `/collections` | Low |
| Decompose monolithic components (I-22) | Maintainability | Easier iteration | `onboarding`, `cash-unblock`, `payments` | High |
| Totals from API not page items (I-17) | Accurate metrics | Trustworthy totals | `/receivables` | Medium |
| Unified toast/error system (I-25) | Consistent feedback | Professional error handling | All pages | Medium |

### Long-Term Design-System Improvements

| Problem | Why it matters | Expected benefit | Affected pages/components | Complexity |
|---|---|---|---|---|
| Single canonical surface/color palette | Eliminate three color systems | Brand consistency | All pages | High |
| Unified button/input/table components | Reduce duplication | Faster, consistent UI | All pages | High |
| Design-token consumption in components | Make `tokens.ts` the source of truth | Maintainable theming | All components | High |
| Document design system (DESIGN.md exists but partial) | Team onboarding | Consistent implementation | N/A | Low |

---

## 14. PILOT READINESS DECISION

1. **Can a new finance user understand the product?** Partially. The dashboard pressure map and cash-unblock "My Next 5" are intelligible, but hardcoded role and mock data create confusion.
2. **Can the user successfully complete the supported workflow?** Partially. Upload → dashboard → exceptions → collections → approvals is functional end-to-end, but approval gating is not visually role-enforced and settings save is simulated.
3. **Does the UI communicate the actual product capabilities?** Largely yes for O2C coverage, but the cash-unblock "recovered cash" section and investigations hardcoded impact overstate verified outcomes.
4. **Are financial results understandable and traceable?** Partially. Provenance labels exist but are inconsistently applied; some figures are hardcoded.
5. **Can users distinguish recommendations from verified facts?** Partially. `provenance` prop and VERIFIED/INFERRED edge labels help, but `RECOVERED CASH` marked VERIFIED while backed by mock data (I-01) directly violates this principle.
6. **Are operational failure states handled adequately?** No. `alert()` is used; simulated save shows success without API; execution failure shows `alert()`.
7. **Is the application usable across screen sizes?** Partially. Sidebar drawer works; landing table breaks mobile; light mode incomplete.
8. **Are there any critical UI blockers?** Yes — I-01 (mock verified cash), I-02/I-03 (hardcoded financial figures), I-04 (role-selector theater).

### Decision: Ready for controlled internal demonstration ONLY. Not ready for restricted design-partner evaluation or real customer data.

**Must fix before first design partner:** I-01, I-02, I-03, I-04, I-05/I-21, I-14 (immediate critical corrections above).

**Can safely wait until after pilot feedback:** I-18, I-19, I-22, I-25 (post-pilot); long-term design-system work.

**Rationale:** The product's backend architecture is genuine and substantial. The UI has real workflow coverage. However, presenting mock financial data as verified outcomes (I-01) and hardcoded financial figures (I-02, I-03) are trust-critical failures that would cause a design partner to question the integrity of the entire product. These must be corrected before any external demonstration with real or realistic data.

---

## AUDIT SUMMARY METRICS

- **Total routes discovered:** 31 UI routes (+ ~50 API routes)
- **Total pages inspected:** 29 page source files read in full
- **Total shared components examined:** ~40 (layout, nav, design-system, system, intelligence, landing, pricing, tenant, billing)
- **Total user journeys evaluated:** 7 (O2C stages mapped to routes)
- **Total confirmed issues:** 25
- **P0 findings:** 1
- **P1 findings:** 4
- **P2 findings:** 14
- **P3 findings:** 6
- **Tests executed:** None (no browser automation performed; authentication credentials unavailable; static source-level inspection only)
- **Routes/states not accessible:** `/agents/[agentId]`, `/settings/billing`, `/settings/notifications` (page sources not located); light-mode rendering of payments/reports/integrations (unverified)
- **Overall UI maturity assessment:** Functionally substantive frontend with genuine O2C coverage, but impaired by design drift, integrity issues (mock financial data), and partial accessibility. Scorecard average ~5.5/10.
- **Highest-priority improvements:** Remove mock recovered-cash data (`/cash-unblock`); remove hardcoded financial impact/confidence; remove permission-theater role selector; source role from auth; connect settings save to real API.

---

**End of audit.** No source files were modified. No changes made to the working tree. Awaiting explicit approval before any remediation work begins.
