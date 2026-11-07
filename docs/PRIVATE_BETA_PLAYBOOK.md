# AIOSpark Private Beta — Operational Playbook (Layer 31)

This playbook outlines the exact operational procedures for recruiting, onboarding, and running structured weekly check-ins with private beta organizations.

---

## 1. Beta Cohort Recruitment Strategy (5-10 Target Segment Companies)
Target a representative mix of company sizes, industries, and ERP systems:
- **ERP Integration Mix**: 3 Tally ERP users, 3 Zoho Books/CRM users, 2 CSV/Excel batch export users.
- **Industry Diversity**: Manufacturing, distribution, IT services, logistics.
- **Financial Profile**: Monthly invoice volume ranging from 200 to 5,000 invoices per month.

---

## 2. Production Data Onboarding Protocol
- **Live Onboarding**: Onboard every customer using the production Layer 4 onboarding flow (`/onboarding`).
- **No Manual Behind-the-Scenes Hand-Holding**: Force messy real-world data (duplicate customer names, inconsistent date formats, missing PO numbers) through the production data adapters.
- **Signal Extraction**: If onboarding fails or data is garbled, log the issue immediately into the Layer 31 Beta Metrics Tracker referencing the affected layer (e.g. `Layer 7 — CSV Importer` or `Layer 5 — ERP Sync`).

---

## 3. Weekly Check-In Execution & Metrics Capture
Run structured weekly calls with each beta company contact. **No call is considered complete without logging quantitative numbers into the Admin Console Beta Tracker (`/admin/beta`)**:

### Quantitative Metrics Recorded Weekly:
1. `invoices_processed`: Cumulative & week-over-week delta.
2. `issues_detected`: Total exception count surfaced by Layer 15.
3. `issues_correctly_classified`: Human-confirmed sample tag count.
4. `cash_unlocked_amount`: Sum of payments received attributable to prior approved AI recommendations within the **14-day attribution window**.
5. `time_saved_estimate`: Estimated hours saved (0.5h per resolved exception).
6. `collection_effectiveness_delta`: Baseline vs. current Collection Effectiveness (CE) index percentage.
7. `human_intervention_count`: Layer 18 approval queue rejections and modifications.
8. `ai_error_count`: Explicitly flagged AI classification mistakes.

---

## 4. Engineering Feedback Loop Protocol
Every issue raised during a beta check-in call must be converted into a tracked engineering task specifying the exact affected layer:
- *Example*: "Tally export date parsing broke on `DD/MM/YYYY` format" ➔ Converted to **`[Layer 7 — CSV Importer] Tally export date parsing error`**.
- Fixes must be committed directly to the relevant layer in the core codebase, **never patched as custom one-off workarounds in the customer's beta environment**.

---

## 5. Gate Criteria Before Public Launch (Layer 32)
Before declaring the beta complete and proceeding to Layer 32 (Public Launch), verify that:
1. All 8 quantitative metrics have been captured for every beta company for at least 4 consecutive weeks.
2. At least one confirmed, end-to-end "cash unlocked" outcome exists with verifiable proof.
3. Every significant issue raised has been triaged and resolved in the relevant codebase layer.
4. Written permission is secured from at least 3 beta companies to use their confirmed outcomes (anonymized or named) as launch case studies.
