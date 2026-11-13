-- 005_create_payment_reversals.sql
-- Creates the udm_payment_reversals table for reversal tracking.
-- AR payment domain: tracks reversals independently. Preserves the original transaction.
-- Reversals distinguish from refunds (typically gateway-level vs internal corrections).
--
-- Tenant isolation: All rows scoped by organization_id. RLS policies ensure
-- that queries respect app.current_org_id set by the middleware.

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS udm_payment_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  payment_id TEXT NOT NULL REFERENCES udm_payments(id),
  reversal_amount_minor_units INTEGER NOT NULL CHECK (reversal_amount_minor_units > 0),
  reversal_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  reversed_by TEXT,
  original_transaction_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',

  CONSTRAINT chk_payment_reversals_amount_positive
    CHECK (reversal_amount_minor_units > 0),

  CONSTRAINT chk_payment_reversals_currency_length
    CHECK (length(currency) = 3)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_payment_reversals_org
  ON udm_payment_reversals (organization_id);

CREATE INDEX IF NOT EXISTS idx_payment_reversals_payment
  ON udm_payment_reversals (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_reversals_org_status
  ON udm_payment_reversals (organization_id);

-- Tenant isolation RLS policies
ALTER TABLE udm_payment_reversals ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_select ON udm_payment_reversals
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_insert ON udm_payment_reversals
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_update ON udm_payment_reversals
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_delete ON udm_payment_reversals
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));

-- Comment explaining the table purpose
COMMENT ON TABLE udm_payment_reversals IS
  'AR payment reversals: tracks reversals independently. Preserves the original transaction. ' ||
  'Reversals distinguish from refunds (typically gateway-level vs internal corrections). ' ||
  'Each reversal tracks the amount, reason, and who reversed it. ' ||
  'Reversal totals are computed as SUM(reversal_amount_minor_units). ' ||
  'Linked to original payment via payment_id foreign key. ' ||
  'Does not delete or modify the original payment record.';

-- Index for computing total reversed amount per payment
CREATE INDEX IF NOT EXISTS idx_payment_reversals_payment
  ON udm_payment_reversals (payment_id, reversal_amount_minor_units);