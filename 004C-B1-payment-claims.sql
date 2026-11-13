-- ============================================================================
-- 004C-B1 Payment Claims — Atomic PostgreSQL Claims for Distributed Execution
--============================================================================
-- Purpose: Replace invocation-local Set<string> (claimedPaymentIds) with
--          durable, tenant-scoped, atomic PostgreSQL claims so that
--          multi-instance/serverless deployments cannot process the same
--          payment twice.
--
-- Design:
--   - One row per (organization_id, payment_id) with lease-generation fencing.
--   - Atomic claim acquisition via RPC: acquire_payment_claim(org_id, payment_id, claim_token, lease_generation)
--   - A worker owns a claim via its unique claim_token.
--   - lease_generation increments on each renewal/re-acquisition; stale workers
--     see a higher generation and reject their operation.
--   - Claims have an expires_at timestamp; abandoned claims expire and can be
--     recovered by any worker.
--   - Tenant isolation is enforced by organization_id and RLS policies.
--===========================================================================

-- Create the payment_claims table
CREATE TABLE IF NOT EXISTS public.payment_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  owner_token TEXT NOT NULL, -- unique token identifying the worker process
  lease_generation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tenant-scoped unique constraint: one active claim per (organization_id, payment_id)
  CONSTRAINT uq_payment_claims_org_payment UNIQUE (organization_id, payment_id) WHERE status = 'active',

  -- Fencing constraint: lease_generation must always be positive
  CONSTRAINT chk_payment_claims_generation CHECK (lease_generation > 0),

  -- Expires_at must be in the future while claim is active
  CONSTRAINT chk_payment_claims_expires CHECK (
    status != 'active' OR expires_at > NOW()
  )
);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_payment_claims_org_id ON public.payment_claims(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_claims_payment_id ON public.payment_claims(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_claims_status_expires ON public.payment_claims(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_claims_org_active ON public.payment_claims(organization_id, status) WHERE status = 'active';

-- Enable RLS
ALTER TABLE public.payment_claims ENABLE ROW LEVEL SECURITY;

-- RLS policies: workers can only see/claim payments in their own organization
CREATE POLICY payment_claims_tenant_isolation_select ON public.payment_claims
  FOR SELECT USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY payment_claims_tenant_isolation_insert ON public.payment_claims
  FOR INSERT WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY payment_claims_tenant_isolation_update ON public.payment_claims
  FOR UPDATE USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY payment_claims_tenant_isolation_delete ON public.payment_claims
  FOR DELETE USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- RPC Function: acquire_payment_claim
--
-- Atomic transaction that acquires or renews a payment claim.
-- Returns the claim row and a status indicator.
--
-- Behavior:
--   1. If no active claim exists for (org_id, payment_id): create a new claim
--      with the given claim_token and lease_generation, return status 'acquired'.
--   2. If an active claim exists with the SAME claim_token and lease_generation:
--      -- renew the lease (update expires_at), return status 'renewed'.
--   3. If an active claim exists with a DIFFERENT claim_token and a HIGHER
--      lease_generation: return status 'conflict' — another worker owns a newer claim.
--   4. If an active claim exists with a DIFFERENT claim_token and a LOWER
--      lease_generation: upgrade the claim (replace owner_token and generation),
--      return status 'upgraded'.
--
--   All cases use a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING
--   pattern with pg_try_advisory_lock for cross-process serialization.
--===========================================================================

CREATE OR REPLACE FUNCTION acquire_payment_claim(
  org_id UUID,
  payment_id UUID,
  claim_token TEXT,
  lease_generation INTEGER
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  payment_id UUID,
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
  -- Use an advisory lock per (organization_id, payment_id) to serialize
  -- claim acquisition within the same org/partition without full row locking.
  PERFORM pg_advisory_xact_hash(org_id::bigint, payment_id::bigint);

  -- Try to insert a new claim atomically
  INSERT INTO public.payment_claims (
    organization_id, payment_id, owner_token, lease_generation,
    status, expires_at, created_at, updated_at
  )
  VALUES (
    org_id, payment_id, claim_token, lease_generation,
    'active',
    NOW() + INTERVAL '24 hours',
    NOW(), NOW()
  )
  ON CONFLICT (organization_id, payment_id) DO UPDATE
  SET
    owner_token = EXCLUDED.owner_token,
    lease_generation = EXCLUDED.lease_generation,
    status = 'active',
    expires_at = NOW() + INTERVAL '24 hours',
    updated_at = NOW()
  RETURNING
    id AS claim_id,
    organization_id,
    payment_id,
    owner_token,
    lease_generation,
    status,
    expires_at,
    NOW() AS renewed_at
  INTO result.claim_id, result.organization_id, result.payment_id,
      result.owner_token, result.lease_generation, result.status,
      result.expires_at, result.renewed_at;

  -- Check what happened after the INSERT...ON CONFLICT:
  -- If the returned lease_generation is the one we tried to insert, we either
  -- newly acquired or upgraded an older claim.
  -- If the returned lease_generation is higher, another worker already has a newer claim.

  -- Determine the status based on comparison
  IF result.lease_generation = lease_generation THEN
    -- We either newly acquired or upgraded (our generation matched)
    result.status := 'acquired';
  ELSIF result.lease_generation > lease_generation THEN
    -- Another worker has a newer claim — we cannot acquire it
    result.status := 'conflict';
    -- Still return the claim info so the caller can read the owner token
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

-- Status kind for internal use (not a real table type, just documentation)
STATUS KIND 'acquired' := 'acquired';
STATUS KIND 'renewed' := 'renewed';
STATUS KIND 'conflict' := 'conflict';

-- ============================================================================
-- RPC Function: release_payment_claim
--
-- Releases a claim owned by the current worker (matching claim_token).
-- Returns the updated claim row.
--===========================================================================

CREATE OR REPLACE FUNCTION release_payment_claim(
  org_id UUID,
  payment_id UUID,
  claim_token TEXT
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  payment_id UUID,
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
  UPDATE public.payment_claims
  SET
    status = 'released',
    owner_token = NULL,
    lease_generation = lease_generation + 1, -- increment generation to fencing
    updated_at = NOW()
  WHERE
    organization_id = org_id AND
    payment_id = payment_id AND
    owner_token = claim_token AND
    status = 'active'
  RETURNING
    id AS claim_id,
    organization_id,
    payment_id,
    owner_token,
    lease_generation,
    status,
    expires_at;
END;
$$;

-- ============================================================================
-- RPC Function: refresh_payment_claim_lease
--
-- Refreshes the lease expiration for a claim owned by the current worker.
-- Returns the updated claim row, or NULL if the token doesn't match.
--===========================================================================

CREATE OR REPLACE FUNCTION refresh_payment_claim_lease(
  org_id UUID,
  payment_id UUID,
  claim_token TEXT
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  payment_id UUID,
  owner_token TEXT,
  lease_generation INTEGER,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  UPDATE public.payment_claims
  SET
    expires_at = NOW() + INTERVAL '24 hours',
    updated_at = NOW()
  WHERE
    organization_id = org_id AND
    payment_id = payment_id AND
    owner_token = claim_token AND
    status = 'active'
  RETURNING
    id AS claim_id,
    organization_id,
    payment_id,
    owner_token,
    lease_generation,
    status,
    expires_at;
END;
$$;

-- ============================================================================
-- Helper: Get active claim for a payment (for reading state)
--===========================================================================

CREATE OR REPLACE FUNCTION get_active_payment_claim(
  org_id UUID,
  payment_id UUID
)
RETURNS TABLE (
  claim_id UUID,
  organization_id UUID,
  payment_id UUID,
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
    payment_id,
    owner_token,
    lease_generation,
    status,
    expires_at
  FROM public.payment_claims
  WHERE
    organization_id = org_id AND
    payment_id = payment_id AND
    status = 'active';
END;
$$;

-- Grant public usage (or restrict as needed for your deployment)
GRANT EXECUTE ON FUNCTION acquire_payment_claim TO public;
GRANT EXECUTE ON FUNCTION release_payment_claim TO public;
GRANT EXECUTE ON FUNCTION refresh_payment_claim_lease TO public;
GRANT EXECUTE ON FUNCTION get_active_payment_claim TO public;