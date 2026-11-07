# AIOSpark Onboarding & Activation Flow (Layer 4)

## Overview & Activation Purpose

The Layer 4 Onboarding System takes verified users from signup completion (Layer 2 & Layer 3) to **first actionable receivables insight in one sitting** with zero engineering intervention.

It treats CSV/Excel file uploads as a **first-class integration path**, giving equal visual prominence to Tally, Zoho Books, and File Ingestion.

---

## 6-Step Activation Sequence

1. **Welcome Screen**: Confirms organization creation and presents a single primary CTA: *"Get Started →"*.
2. **Company Setup Form**: Captures mandatory financial year start month, currency, default payment terms, annual revenue range, industry, timezone, and country.
3. **Connect Financial System**: Offers Tally ERP, Zoho Books, and Upload CSV/Excel with equal visual prominence. Tally and Zoho present a connector setup modal ("Coming soon — use CSV/Excel import in the meantime") with a working CTA back to CSV.
4. **CSV/Excel File Import & Mapping**:
   - Supports `.csv`, `.xlsx`, `.xls` file upload.
   - Auto-suggests column mappings based on upload header names.
   - Saves confirmed column mapping per organization so future imports require no re-mapping.
   - Fault-tolerant row validation: Valid rows are imported into tenant ledgers; invalid rows are collected in a per-row error list without halting the import.
5. **Real-time Progress Feedback**: Progressive multi-stage status UI (*Uploading file → Validating schema → Importing invoices → Detecting exceptions*).
6. **Completion & Insight Landing**: Plain-language summary (*e.g., "1,248 invoices imported successfully, 12 skipped — view details"*) with link to skipped-row error details and direct routing to the active dashboard.

---

## Database Schema Additions (`src/lib/onboarding/schema-onboarding.sql`)

### Extended `organizations` Fields
```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS annual_revenue_range TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fy_start_month TEXT,
  ADD COLUMN IF NOT EXISTS default_payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
```

### `organization_mappings` Table (Saved Column Mapping per Org)
```sql
CREATE TABLE IF NOT EXISTS public.organization_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  mapping_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `import_batches` Table (Batch Execution & Error Logging)
```sql
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL DEFAULT 'csv',
  total_rows INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  error_log_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Activation Funnel Metrics

Step-level activation events are instrumented in `src/lib/onboarding/analytics.ts`:

- `onboarding_welcome_viewed`: User lands on Step 1.
- `onboarding_company_setup_completed`: Financial parameters (`fy_start_month`, `currency`, `payment_terms`) saved.
- `onboarding_connection_method_chosen`: Selected system connector (`tally`, `zoho`, or `csv`).
- `onboarding_import_started`: Column mapping confirmed and import initiated.
- `onboarding_import_completed`: Ingestion batch finished with success/skipped counts.
- `onboarding_landed_on_dashboard`: User transitioned to workspace dashboard with real data.
