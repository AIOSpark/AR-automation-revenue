import fs from 'fs';
import path from 'path';

export function getSecurityMigrationSQL(): string {
  return `
-- Enable Row Level Security (RLS) on Tenant Tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create Tenant Context Function
CREATE OR REPLACE FUNCTION current_app_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS Policies for Invoices (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS tenant_isolation_invoices_select ON invoices;
CREATE POLICY tenant_isolation_invoices_select ON invoices
  FOR SELECT USING (organization_id = current_app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_invoices_insert ON invoices;
CREATE POLICY tenant_isolation_invoices_insert ON invoices
  FOR INSERT WITH CHECK (organization_id = current_app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_invoices_update ON invoices;
CREATE POLICY tenant_isolation_invoices_update ON invoices
  FOR UPDATE USING (organization_id = current_app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_invoices_delete ON invoices;
CREATE POLICY tenant_isolation_invoices_delete ON invoices
  FOR DELETE USING (organization_id = current_app_tenant_id());

-- Audit Log RLS Policies
DROP POLICY IF EXISTS tenant_isolation_audit_select ON audit_logs;
CREATE POLICY tenant_isolation_audit_select ON audit_logs
  FOR SELECT USING (organization_id = current_app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_audit_insert ON audit_logs;
CREATE POLICY tenant_isolation_audit_insert ON audit_logs
  FOR INSERT WITH CHECK (organization_id = current_app_tenant_id());

-- AUDIT LOG IMMUTABILITY TRIGGER (Layer 26 Enforcement)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are strictly immutable. UPDATE and DELETE operations are prohibited at database engine level.'
  USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();
`;
}
