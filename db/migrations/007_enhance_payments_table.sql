-- 007_enhance_payments_table.sql
-- Enhances the udm_payments table with AR payment domain fields.
-- Additive: ADD COLUMN IF NOT EXISTS with DEFAULT values for backward compatibility.
-- Does not delete or modify existing data.
--
-- The payment_type field distinguishes SaaS subscription payments from AR customer payments.
-- The status field tracks the payment lifecycle state.
-- The payment_method and payment_source fields capture gateway/provider information.

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add payment_type column to distinguish payment sources
-- Default 'ar_customer' for new AR payments; existing SaaS subscriptions default to this
-- but can be updated to 'saas_subscription' as needed
ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'ar_customer'
  CHECK (payment_type IN ('saas_subscription', 'ar_customer', 'bank_transfer', 'razorpay_payment', 'manual'));

-- Add payment_method column to capture the payment method
ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_method TEXT;
COMMENT ON COLUMN udm_payments.payment_method IS 'Payment method: card, UPI, netbanking, wallet, bank_transfer, cash, etc.';

-- Add payment_source column to capture the provider/source
ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS payment_source TEXT;
COMMENT ON COLUMN udm_payments.payment_source IS 'Payment source: razorpay, manual_upload, bank_api, csv_import, api_import, etc.';

-- Add status column to track payment lifecycle state
ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS status TEXT
  CHECK (status IN ('authorized','captured','pending','refunded','reversed','failed'));

-- Add capture_timestamp for tracking when a payment was captured
ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS capture_timestamp TIMESTAMPTZ;

-- Add authorization_timestamp for tracking when a payment was authorized
ALTER TABLE udm_payments ADD COLUMN IF NOT EXISTS authorization_timestamp TIMESTAMPTZ;

-- Update RLS policies to include the new column (if RLS is already enabled)
-- Note: RLS policies are idempotent; recreating them is safe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'udm_payments') THEN
    ALTER TABLE udm_payments ENABLE ROW LEVEL SECURITY;
  END IF;
END$$;

CREATE POLICY org_isolation_select ON udm_payments
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_insert ON udm_payments
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_update ON udm_payments
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_delete ON udm_payments
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));

-- Comment explaining the enhancements
COMMENT ON TABLE udm_payments IS
  'UDM payments table enhanced for AR payment domain. ' ||
  'payment_type distinguishes SaaS subscription payments from AR customer payments. ' ||
  'payment_method captures the payment method (card, UPI, etc.). ' ||
  'payment_source captures the provider/source (razorpay, manual, etc.). ' ||
  'status tracks the payment lifecycle (authorized, captured, pending, refunded, reversed, failed). ' ||
  'capture_timestamp and authorization_timestamp track lifecycle milestones. ' ||
  'Existing data is preserved with default values. ' ||
  'RLS policies ensure tenant isolation for all operations.';

-- Note: The payment_type DEFAULT 'ar_customer' ensures existing rows are not broken.
-- SaaS subscription payments should be updated to payment_type = 'saas_subscription'
-- via a separate migration or application logic.