-- AIOSpark Layer 7 Robust Data Import Pipeline Schema

-- 1. IMPORT BATCHES TABLE (PERSISTS RAW PAYLOAD & RUNNING METRICS)
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL DEFAULT 'csv',
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  raw_payload JSONB, -- Durable raw untransformed input before transformation
  date_format_convention TEXT DEFAULT 'DD/MM/YYYY', -- Explicit date format setting
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_org_id ON public.import_batches(organization_id);

-- 2. IMPORT ERRORS TABLE (PER-RECORD HUMAN-READABLE SKIPPED REASONS)
CREATE TABLE IF NOT EXISTS public.import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  raw_row_reference JSONB NOT NULL,
  reason TEXT NOT NULL,
  field TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_errors_batch_id ON public.import_errors(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_errors_org_id ON public.import_errors(organization_id);

-- 3. POSSIBLE DUPLICATES REVIEW QUEUE TABLE
CREATE TABLE IF NOT EXISTS public.possible_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  incoming_record_json JSONB NOT NULL,
  existing_record_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  confidence NUMERIC(4,3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_possible_duplicates_org_id ON public.possible_duplicates(organization_id);
CREATE INDEX IF NOT EXISTS idx_possible_duplicates_batch_id ON public.possible_duplicates(import_batch_id);

-- 4. CONFIRM PIPELINE INDEXES ON UNIVERSAL TABLES FOR QUERY SPEED
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_source ON public.invoices(organization_id, source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_source ON public.customers(organization_id, source_system, source_id);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.possible_duplicates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_import_batches ON public.import_batches;
CREATE POLICY tenant_isolation_import_batches ON public.import_batches
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_import_errors ON public.import_errors;
CREATE POLICY tenant_isolation_import_errors ON public.import_errors
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_possible_duplicates ON public.possible_duplicates;
CREATE POLICY tenant_isolation_possible_duplicates ON public.possible_duplicates
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
