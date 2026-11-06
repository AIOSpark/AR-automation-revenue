-- AIOSpark Universal Data Model Schema (Layer 6)
-- Complete Production PostgreSQL Schema with Foreign Keys, Minor Units, Indexes, & RLS Policies

-- ENUM DEFINITIONS FOR STRICT STATUS FIELDS
DO $$ BEGIN
    CREATE TYPE invoice_status_enum AS ENUM ('open', 'partially_paid', 'paid', 'disputed', 'written_off', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dispute_status_enum AS ENUM ('open', 'under_review', 'resolved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE exception_severity_enum AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE exception_status_enum AS ENUM ('detected', 'classified', 'pending_approval', 'approved', 'executed', 'verified', 'rejected', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tax_id TEXT,
  billing_address JSONB DEFAULT '{}'::jsonb,
  shipping_address JSONB DEFAULT '{}'::jsonb,
  credit_limit_minor_units BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  risk_score NUMERIC(5,2),
  parent_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  industry TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, source_system, source_id)
);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_parent_id ON public.customers(parent_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_owner_id ON public.customers(owner_user_id);

-- 2. CUSTOMER CONTACTS TABLE
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role_title TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_org_id ON public.customer_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON public.customer_contacts(customer_id);

-- 3. INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  amount_minor_units BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  tax_amount_minor_units BIGINT NOT NULL DEFAULT 0,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status invoice_status_enum NOT NULL DEFAULT 'open',
  po_reference TEXT,
  delivery_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, source_system, source_id)
);
CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);

-- 4. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount_minor_units BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  date DATE NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, source_system, source_id)
);
CREATE INDEX IF NOT EXISTS idx_payments_org_id ON public.payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);

-- 5. PAYMENT INVOICE MATCH TABLE (MANY-TO-MANY RECONCILIATION)
CREATE TABLE IF NOT EXISTS public.payment_invoice_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  matched_amount_minor_units BIGINT NOT NULL,
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_matches_org_id ON public.payment_invoice_matches(organization_id);
CREATE INDEX IF NOT EXISTS idx_matches_payment_id ON public.payment_invoice_matches(payment_id);
CREATE INDEX IF NOT EXISTS idx_matches_invoice_id ON public.payment_invoice_matches(invoice_id);

-- 6. CREDIT NOTES TABLE
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount_minor_units BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, source_system, source_id)
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_org_id ON public.credit_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer_id ON public.credit_notes(customer_id);

-- 7. DISPUTES TABLE
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  amount_minor_units BIGINT,
  status dispute_status_enum NOT NULL DEFAULT 'open',
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_disputes_org_id ON public.disputes(organization_id);
CREATE INDEX IF NOT EXISTS idx_disputes_invoice_id ON public.disputes(invoice_id);

-- 8. DISPUTE EVIDENCE TABLE
CREATE TABLE IF NOT EXISTS public.dispute_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispute_evidences_org_id ON public.dispute_evidences(organization_id);
CREATE INDEX IF NOT EXISTS idx_dispute_evidences_dispute_id ON public.dispute_evidences(dispute_id);

-- 9. EXCEPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity exception_severity_enum NOT NULL DEFAULT 'medium',
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  recommended_action TEXT,
  resolution TEXT,
  status exception_status_enum NOT NULL DEFAULT 'detected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exceptions_org_id ON public.exceptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_invoice_id ON public.exceptions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_customer_id ON public.exceptions(customer_id);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES ON ALL UNIVERSAL DATA MODEL TABLES
-- =========================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoice_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_customers ON public.customers;
CREATE POLICY tenant_isolation_customers ON public.customers
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_customer_contacts ON public.customer_contacts;
CREATE POLICY tenant_isolation_customer_contacts ON public.customer_contacts
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_invoices ON public.invoices;
CREATE POLICY tenant_isolation_invoices ON public.invoices
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_payments ON public.payments;
CREATE POLICY tenant_isolation_payments ON public.payments
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_payment_invoice_matches ON public.payment_invoice_matches;
CREATE POLICY tenant_isolation_payment_invoice_matches ON public.payment_invoice_matches
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_credit_notes ON public.credit_notes;
CREATE POLICY tenant_isolation_credit_notes ON public.credit_notes
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_disputes ON public.disputes;
CREATE POLICY tenant_isolation_disputes ON public.disputes
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_dispute_evidences ON public.dispute_evidences;
CREATE POLICY tenant_isolation_dispute_evidences ON public.dispute_evidences
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_exceptions ON public.exceptions;
CREATE POLICY tenant_isolation_exceptions ON public.exceptions
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
