-- 004_create_payment_refunds.sql
-- Creates the udm_payment_refunds table for refund tracking.
-- AR payment domain: records refunds independently. Never deletes or overwrites
-- original payment data. Prevents total refunds from exceeding eligible captured amount.
--
-- Tenant isolation: All rows scoped by organization_id. RLS policies ensure
-- that queries respect app.current_org_id set by the middleware.

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS udm_payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  payment_id TEXT NOT NULL REFERENCES udm_payments(id),
  refund_amount_minor_units INTEGER NOT NULL CHECK (refund_amount_minor_units > 0),
  currency TEXT NOT NULL,
  refund_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('processed','partial','failed')),
  reason TEXT,
  refunded_by TEXT,
  original_transaction_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',

  CONSTRAINT chk_payment_refunds_amount_positive
    CHECK (refund_amount_minor_units > 0),

  CONSTRAINT chk_payment_refunds_status
    CHECK (status IN ('processed','partial','failed')),

  CONSTRAINT chk_payment_refunds_currency_length
    CHECK (length(currency) = 3)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_payment_refunds_org
  ON udm_payment_refunds (organization_id);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
  ON udm_payment_refunds (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_org_status
  ON udm_payment_refunds (organization_id, status);

-- Tenant isolation RLS policies
ALTER TABLE udm_payment_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_select ON udm_payment_refunds
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_insert ON udm_payment_refunds
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_update ON udm_payment_refunds
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_delete ON udm_payment_refunds
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));

-- Comment explaining the table purpose
COMMENT ON TABLE udm_payment_refunds IS
  'AR payment refunds: records refunds independently. Never deletes or overwrites ' ||
  'original payment data. Each refund tracks the amount, reason, and status. ' ||
  'Prevents total refunds from exceeding the eligible captured amount. ' ||
  'Refund totals are computed as SUM(refund_amount_minor_units) WHERE status = ''processed''. ' ||
  'Linked to original payment via payment_id foreign key.';

-- Index for computing total refunded amount per payment
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_processed
  ON udm_payment_refunds (payment_id, status, refund_amount_minor_units);