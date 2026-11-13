-- 006_create_ar_reconciliation.sql
-- Creates the udm_ar_reconciliation table for reconciliation records.
-- AR payment domain: stores reconciliation results between gateway transactions
-- and internal payment records. Does not automatically match ambiguous transactions.
--
-- Tenant isolation: All rows scoped by organization_id. RLS policies ensure
-- that queries respect app.current_org_id set by the middleware.

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS udm_ar_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  payment_id TEXT NOT NULL REFERENCES udm_payments(id),
  external_transaction_id TEXT,
  amount_discrepancy_minor_units INTEGER,
  currency_discrepancy TEXT,
  match_status TEXT NOT NULL CHECK (match_status IN ('matched','partial','unmatched')),
  reason TEXT,
  reviewer TEXT,
  review_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT chk_ar_reconciliation_match_status
    CHECK (match_status IN ('matched','partial','unmatched')),

  CONSTRAINT chk_ar_reconciliation_currency_length
    CHECK (length(currency_discrepancy) = 3 OR currency_discrepancy IS NULL)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_org
  ON udm_ar_reconciliation (organization_id);

CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_payment
  ON udm_ar_reconciliation (payment_id);

CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_match_status
  ON udm_ar_reconciliation (match_status, organization_id);

CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_external
  ON udm_ar_reconciliation (external_transaction_id);

-- Tenant isolation RLS policies
ALTER TABLE udm_ar_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_select ON udm_ar_reconciliation
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_insert ON udm_ar_reconciliation
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_update ON udm_ar_reconciliation
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_delete ON udm_ar_reconciliation
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));

-- Comment explaining the table purpose
COMMENT ON TABLE udm_ar_reconciliation IS
  'AR reconciliation records: stores reconciliation results between gateway transactions ' &&
  'and internal payment records. Does not automatically match ambiguous transactions. ' ||
  'Each record tracks the internal payment reference, external transaction reference, ' ||
  'amount and currency discrepancies, and the match status. ' ||
  'Reviewed by a human or automated system with reviewer and review timestamp. ' ||
  'Match status: matched (fully matched), partial (partially matched), unmatched (no match). ' ||
  'External transaction ID is the gateway/processor transaction ID (e.g., Razorpay payment ID). ' ||
  'Amount discrepancy and currency discrepancy capture mismatches between internal and external amounts.';

-- Index for scanning unmatched reconciliations
CREATE INDEX IF NOT EXISTS idx_ar_reconciliation_unmatched
  ON udm_ar_reconciliation (match_status, organization_id)
  WHERE match_status = 'unmatched';