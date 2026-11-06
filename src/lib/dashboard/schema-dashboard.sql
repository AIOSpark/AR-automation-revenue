-- AIOSpark Layer 9 Core Dashboard Metrics Cache Schema

CREATE TABLE IF NOT EXISTS public.organization_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  total_receivables_minor_units BIGINT NOT NULL DEFAULT 0,
  overdue_minor_units BIGINT NOT NULL DEFAULT 0,
  at_risk_minor_units BIGINT NOT NULL DEFAULT 0,
  cash_unblocked_opportunity_minor_units BIGINT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_cache_org_id ON public.organization_metrics_cache(organization_id);

ALTER TABLE public.organization_metrics_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_metrics_cache ON public.organization_metrics_cache;
CREATE POLICY tenant_isolation_metrics_cache ON public.organization_metrics_cache
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
