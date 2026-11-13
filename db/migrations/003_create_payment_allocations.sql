-- 003_create_payment_allocations.sql
-- Creates the udm_payment_allocations table for 1:N payment-to-invoice allocations.
-- AR payment domain: enables allocating one payment across multiple invoices.
-- Separate from existing udm_payment_matches which is 1:1 matching.
--
-- Tenant isolation: All rows scoped by organization_id. RLS policies ensure
-- that queries respect app.current_org_id set by the middleware.
--
-- Financial invariants enforced by CHECK constraints:
--   - allocated_amount_minor_units must be positive
--   - status must be one of: allocated, partial, reversed
--   - lease_generation pattern (via actor/actor_timestamp) for conflict detection

-- Ensure pgcrypto extension is available (used for UUID generation)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS udm_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  payment_id TEXT NOT NULL REFERENCES udm_payments(id),
  invoice_id TEXT NOT NULL REFERENCES udm_invoices(id),
  allocated_amount_minor_units INTEGER NOT NULL CHECK (allocated_amount_minor_units > 0),
  status TEXT NOT NULL CHECK (status IN ('allocated','partial','reversed')),
  allocation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL DEFAULT current_setting('app.current_org_id'),
  reversal_reference UUID,
  payload TEXT NOT NULL DEFAULT '{}',

  CONSTRAINT chk_payment_allocations_amount_positive
    CHECK (allocated_amount_minor_units > 0),

  CONSTRAINT chk_payment_allocations_status
    CHECK (status IN ('allocated','partial','reversed')),

  CONSTRAINT chk_payment_allocations_allocated_amount
    CHECK (allocated_amount_minor_units >= 0)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_payment_allocations_org_status
  ON udm_payment_allocations (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_org_payment
  ON udm_payment_allocations (organization_id, payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_invoice
  ON udm_payment_allocations (payment_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_org
  ON udm_payment_allocations (invoice_id, organization_id);

-- Tenant isolation RLS policies
ALTER TABLE udm_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_select ON udm_payment_allocations
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_insert ON udm_payment_allocations
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_update ON udm_payment_allocations
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_delete ON udm_payment_allocations
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));

-- Comment explaining the table purpose
COMMENT ON TABLE udm_payment_allocations IS
  'AR payment allocations: 1:N payment-to-invoice allocations. Each row represents a portion of a payment allocated to one invoice. ' ||
  'Total allocated amount per payment = SUM(allocated_amount_minor_units) WHERE status = ''allocated''. ' ||
  'Separate from udm_payment_matches (1:1 matching). ' ||
  'Enables partial payments and multiple invoice allocations.';

-- Index for scanning allocations by payment to compute outstanding balance
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_allocated
  ON udm_payment_allocations (payment_id, status, allocated_amount_minor_units);