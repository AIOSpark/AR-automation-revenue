-- AIOSpark Layer 4 Onboarding & Data Import Schema

-- 1. Extend Organizations Table with Financial Setup Parameters
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS annual_revenue_range TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fy_start_month TEXT,
  ADD COLUMN IF NOT EXISTS default_payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- 2. Organization Column Mappings Table (Saved Column Mapping Configuration)
CREATE TABLE IF NOT EXISTS public.organization_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  mapping_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Import Batches Table (Batch Execution & Skipped Row Error Logs)
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

CREATE INDEX IF NOT EXISTS idx_import_batches_org_id ON public.import_batches(organization_id);
