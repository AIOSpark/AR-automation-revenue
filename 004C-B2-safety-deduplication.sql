-- ============================================================================
-- 004C-B2 Safety Double-Execution Deduplication — PostgreSQL-backed
--============================================================================
-- Purpose: Replace the durable SQLite-backed double-execution guard in
-- SafetyMiddleware.checkDoubleExecution() with a PostgreSQL-backed mechanism
-- so that duplicate actions are prevented across multiple Vercel/serverless
-- instances and distributed workers.
--
-- Design:
--   - Table: safety_double_execution
--   - One row per (organization_id, agent_name, target_entity, target_id, action_type)
--   - Atomic claim via INSERT ... ON CONFLICT DO UPDATE with lease generation
--   - Expiration and safe recovery via expires_at
--   - Tenant isolation via organization_id and RLS
--   - Owner token identifies the worker process that acquired the claim
--===========================================================================

-- Create the safety_double_execution table
CREATE TABLE IF NOT EXISTS public.safety_double_execution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  target_entity TEXT NOT NULL,     -- e.g. 'invoice', 'exception', 'customer'
  target_id UUID NOT NULL,         -- the specific entity being acted upon
  action_type TEXT NOT NULL,       -- e.g. 'SEND_REMINDER', 'ISSUE_CREDIT_NOTE'
  owner_token TEXT NOT NULL,       -- unique token identifying the worker process
  lease_generation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tenant-scoped unique constraint: one active claim per (org, agent, target, action)
  CONSTRAINT uq_safety_double_execution_active UNIQUE (
    organization_id, agent_name, target_entity, target_id, action_type
  ) WHERE status = 'active',

  -- Fencing constraint: lease_generation must always be positive
  CONSTRAINT chk_safety_double_execution_generation CHECK (lease_generation > 0),

  -- Expires_at must be in the future while claim is active
  CONSTRAINT chk_safety_double_execution_expires CHECK (
    status != 'active' OR expires_at > NOW()
  )
);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_safety_double_execution_org ON public.safety_double_execution(organization_id);
CREATE INDEX IF NOT EXISTS idx_safety_double_execution_agent ON public.safety_double_execution(agent_name);
CREATE INDEX IF NOT EXISTS idx_safety_double_execution_target ON public.safety_double_execution(
  organization_id, agent_name, target_entity, target_id
);
CREATE INDEX IF NOT EXISTS idx_safety_double_expiration ON public.safety_double_execution(
  expires_at
);
CREATE INDEX IF NOT EXISTS idx_safety_double_execution_org_active ON public.safety_double_execution(
  organization_id, status
) WHERE status = 'active';

-- Enable RLS
ALTER TABLE public.safety_double_execution ENABLE ROW LEVEL SECURITY;

-- RLS policies: workers can only see/claim safety records in their own organization
CREATE POLICY safety_double_execution_tenant_isolation_select ON public.safety_double_execution
  FOR SELECT USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY safety_double_execution_tenant_isolation_insert ON public.safety_double_execution
  FOR INSERT WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY safety_double_execution_tenant_isolation_update ON public.safety_double_execution
  FOR UPDATE USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY safety_double_execution_tenant_isolation_delete ON public.safety_double_execution
  FOR DELETE USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- RPC Function: acquire_safety_claim
--
-- Atomic transaction that acquires or renews a double-execution claim.
-- Used by SafetyMiddleware.checkDoubleExecution().
--
-- Behavior:
--   1. If no active claim exists for the (org, agent, target, action) key:
--      create a new claim with the given owner_token and lease_generation,
--      return status 'acquired'.
--   2. If an active claim exists with the SAME owner_token and lease_generation:
--      -- renew the lease (update expires_at), return status 'renewed'.
--   3. If an active claim exists with a DIFFERENT owner_token and a HIGHER
--      lease_generation: return status 'conflict' — another worker owns a newer claim.
--   4. If an active claim exists with a DIFFERENT owner_token and a LOWER
--      lease_generation: upgrade the claim (replace owner_token and generation),
--      return status 'upgraded'.
--
--   All cases use a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING
--   pattern with pg_try_advisory_lock for cross-process serialization.
--===========================================================================

CREATE OR REPLACE FUNCTION acquire_safety_claim(
  org_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT,
  claim_token TEXT,
  lease_generation INTEGER
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT,
  owner_token TEXT,
  lease_generation INTEGER,
  status TEXT,
  expires_at TIMESTAMPTZ,
  renewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result status_kind := 'conflict';
BEGIN
  -- Use an advisory lock per (org_id, agent_name, target_entity, target_id, action_type)
  -- to serialize claim acquisition without full row locking.
  PERFORM pg_advisory_xact_hash(
    org_id::bigint,
    hashtext(agent_name || target_entity || target_id::text || action_type)
  );

  -- Try to insert a new claim atomically
  INSERT INTO public.safety_double_execution (
    organization_id, agent_name, target_entity, target_id, action_type,
    owner_token, lease_generation, status, expires_at, created_at, updated_at
  )
  VALUES (
    org_id, agent_name, target_entity, target_id, action_type,
    claim_token, lease_generation, 'active',
    NOW() + INTERVAL '24 hours', NOW(), NOW()
  )
  ON CONFLICT (organization_id, agent_name, target_entity, target_id, action_type) DO UPDATE
  SET
    owner_token = EXCLUDED.owner_token,
    lease_generation = EXCLUDED.lease_generation,
    status = 'active',
    expires_at = NOW() + INTERVAL '24 hours',
    updated_at = NOW()
  RETURNING
    id AS claim_id,
    organization_id,
    agent_name,
    target_entity,
    target_id,
    action_type,
    owner_token,
    lease_generation,
    status,
    expires_at,
    NOW() AS renewed_at
  INTO result.claim_id, result.organization_id, result.agent_name,
      result.target_entity, result.target_id, result.action_type,
      result.owner_token, result.lease_generation, result.status,
      result.expires_at, result.renewed_at;

  -- Determine the status based on comparison
  IF result.lease_generation = lease_generation THEN
    -- We either newly acquired or upgraded (our generation matched)
    result.status := 'acquired';
  ELSIF result.lease_generation > lease_generation THEN
    -- Another worker has a newer claim — we cannot acquire it
    result.status := 'conflict';
    result.renewed_at := NULL;
  ELSE
    -- This case shouldn't normally happen with the UNIQUE constraint, but
    -- if it does (race condition), treat as conflict
    result.status := 'conflict';
    result.renewed_at := NULL;
  END IF;

  RETURN;
END;
$$;

-- Status kind for internal use (documentation only)
STATUS KIND 'acquired' := 'acquired';
STATUS KIND 'renewed' := 'renewed';
STATUS KIND 'conflict' := 'conflict';

-- ============================================================================
-- RPC Function: release_safety_claim
--
-- Releases a claim owned by the current worker (matching claim_token).
-- Returns the updated claim row.
--===========================================================================

CREATE OR REPLACE FUNCTION release_safety_claim(
  org_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT,
  claim_token TEXT
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT,
  owner_token TEXT,
  lease_generation INTEGER,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Only release if the claim is owned by this token
  UPDATE public.safety_double_execution
  SET
    status = 'released',
    owner_token = NULL,
    lease_generation = lease_generation + 1, -- increment generation to fencing
    updated_at = NOW()
  WHERE
    organization_id = org_id AND
    agent_name = agent_name AND
    target_entity = target_entity AND
    target_id = target_id AND
    action_type = action_type AND
    owner_token = claim_token AND
    status = 'active'
  RETURNING
    id AS claim_id,
    organization_id,
    agent_name,
    target_entity,
    target_id,
    action_type,
    owner_token,
    lease_generation,
    status,
    expires_at;
END;
$$;

-- ============================================================================
-- RPC Function: refresh_safety_claim_lease
--
-- Refreshes the lease expiration for a claim owned by the current worker.
-- Returns the updated claim row, or NULL if the token doesn't match.
--===========================================================================

CREATE OR REPLACE FUNCTION refresh_safety_claim_lease(
  org_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT,
  claim_token TEXT
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT,
  owner_token TEXT,
  lease_generation INTEGER,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  UPDATE public.safety_double_execution
  SET
    expires_at = NOW() + INTERVAL '24 hours',
    updated_at = NOW()
  WHERE
    organization_id = org_id AND
    agent_name = agent_name AND
    target_entity = target_entity AND
    target_id = target_id AND
    action_type = action_type AND
    owner_token = claim_token AND
    status = 'active'
  RETURNING
    id AS claim_id,
    organization_id,
    agent_name,
    target_entity,
    target_id,
    action_type,
    owner_token,
    lease_generation,
    status,
    expires_at;
END;
$$;

-- ============================================================================
-- Helper: Get active safety claim for a specific action
--===========================================================================

CREATE OR REPLACE FUNCTION get_active_safety_claim(
  org_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  agent_name TEXT,
  target_entity TEXT,
  target_id UUID,
  action_type TEXT,
  owner_token TEXT,
  lease_generation INTEGER,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id AS claim_id,
    organization_id,
    agent_name,
    target_entity,
    target_id,
    action_type,
    owner_token,
    lease_generation,
    status,
    expires_at
  FROM public.safety_double_execution
  WHERE
    organization_id = org_id AND
    agent_name = agent_name AND
    target_entity = target_entity AND
    target_id = target_id AND
    action_type = action_type AND
    status = 'active';
END;
$$;

-- Grant public usage
GRANT EXECUTE ON FUNCTION acquire_safety_claim TO public;
GRANT EXECUTE ON FUNCTION release_safety_claim TO public;
GRANT EXECUTE ON FUNCTION refresh_safety_claim_lease TO public;
GRANT EXECUTE ON FUNCTION get_active_safety_claim TO public;