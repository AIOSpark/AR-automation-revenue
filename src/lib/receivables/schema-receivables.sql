-- AIOSpark Layer 10 Receivables Intelligence Saved Filter Views Schema

CREATE TABLE IF NOT EXISTS public.saved_filter_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filter_config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_org_user ON public.saved_filter_views(organization_id, user_id);

ALTER TABLE public.saved_filter_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_saved_filter_views ON public.saved_filter_views;
CREATE POLICY tenant_isolation_saved_filter_views ON public.saved_filter_views
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
