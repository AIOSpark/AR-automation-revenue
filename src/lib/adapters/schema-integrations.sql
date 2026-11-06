-- AIOSpark Integrations & Adapter Configuration Schema (Layer 5)

CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  adapter_type TEXT NOT NULL CHECK (adapter_type IN ('csv', 'zoho', 'tally')),
  config_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'syncing', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, adapter_type)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org_adapter ON public.integrations(organization_id, adapter_type);
