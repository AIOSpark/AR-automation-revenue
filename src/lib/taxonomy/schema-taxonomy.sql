-- AIOSpark Layer 14 Payment-Delay Classification Taxonomy Migration

-- 1. Create strict database enum for 11 locked taxonomy categories
DO $$ BEGIN
    CREATE TYPE payment_delay_category_enum AS ENUM (
      'NORMAL_CYCLE',
      'PAYMENT_PROMISED',
      'CUSTOMER_DISPUTE',
      'PO_MISMATCH',
      'INVOICE_ERROR',
      'GST_TAX_ISSUE',
      'MISSING_DOCUMENT',
      'DELIVERY_ISSUE',
      'APPROVAL_PENDING',
      'CREDIT_ISSUE',
      'UNKNOWN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Migrate public.exceptions table type column to use strict enum
-- (Casts existing free-text values or defaults ambiguous entries to UNKNOWN)
ALTER TABLE public.exceptions
  ALTER COLUMN type TYPE payment_delay_category_enum
  USING (
    CASE type
      WHEN 'PO_QUANTITY_MISMATCH' THEN 'PO_MISMATCH'::payment_delay_category_enum
      WHEN 'PO_PRICE_MISMATCH' THEN 'PO_MISMATCH'::payment_delay_category_enum
      WHEN 'ACTIVE_BILLING_DISPUTE' THEN 'CUSTOMER_DISPUTE'::payment_delay_category_enum
      WHEN 'NORMAL_PAYMENT_CYCLE' THEN 'NORMAL_CYCLE'::payment_delay_category_enum
      WHEN 'GST_INVOICE_MISMATCH' THEN 'GST_TAX_ISSUE'::payment_delay_category_enum
      WHEN 'NORMAL_CYCLE' THEN 'NORMAL_CYCLE'::payment_delay_category_enum
      WHEN 'PAYMENT_PROMISED' THEN 'PAYMENT_PROMISED'::payment_delay_category_enum
      WHEN 'CUSTOMER_DISPUTE' THEN 'CUSTOMER_DISPUTE'::payment_delay_category_enum
      WHEN 'PO_MISMATCH' THEN 'PO_MISMATCH'::payment_delay_category_enum
      WHEN 'INVOICE_ERROR' THEN 'INVOICE_ERROR'::payment_delay_category_enum
      WHEN 'GST_TAX_ISSUE' THEN 'GST_TAX_ISSUE'::payment_delay_category_enum
      WHEN 'MISSING_DOCUMENT' THEN 'MISSING_DOCUMENT'::payment_delay_category_enum
      WHEN 'DELIVERY_ISSUE' THEN 'DELIVERY_ISSUE'::payment_delay_category_enum
      WHEN 'APPROVAL_PENDING' THEN 'APPROVAL_PENDING'::payment_delay_category_enum
      WHEN 'CREDIT_ISSUE' THEN 'CREDIT_ISSUE'::payment_delay_category_enum
      ELSE 'UNKNOWN'::payment_delay_category_enum
    END
  );
