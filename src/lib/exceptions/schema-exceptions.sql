-- AIOSpark Layer 15 Exception Engine Database Schema Extensions

-- 1. Extend exception_status_enum with full state machine states
ALTER TYPE exception_status_enum ADD VALUE IF NOT EXISTS 'severity_determined';
ALTER TYPE exception_status_enum ADD VALUE IF NOT EXISTS 'owner_assigned';
ALTER TYPE exception_status_enum ADD VALUE IF NOT EXISTS 'recommended';

-- 2. Organization Exception Severity Settings Table (Per-Org Configurable Thresholds)
CREATE TABLE IF NOT EXISTS public.organization_exception_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  critical_amount_threshold_minor_units BIGINT NOT NULL DEFAULT 50000000, -- Default ₹5,00,000.00
  critical_days_overdue_threshold INTEGER NOT NULL DEFAULT 60,
  high_amount_threshold_minor_units BIGINT NOT NULL DEFAULT 10000000, -- Default ₹1,00,000.00
  high_days_overdue_threshold INTEGER NOT NULL DEFAULT 30,
  medium_days_overdue_threshold INTEGER NOT NULL DEFAULT 15,
  category_role_mappings JSONB NOT NULL DEFAULT '{"CUSTOMER_DISPUTE": "Finance Manager", "PO_MISMATCH": "Finance Executive", "GST_TAX_ISSUE": "Finance Executive"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exception_settings_org ON public.organization_exception_settings(organization_id);

ALTER TABLE public.organization_exception_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_exception_settings ON public.organization_exception_settings;
CREATE POLICY tenant_isolation_exception_settings ON public.organization_exception_settings
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
