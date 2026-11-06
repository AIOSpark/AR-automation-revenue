// AIOSpark Universal Data Model TypeScript Definitions (Layer 6)

export type InvoiceStatus = 'open' | 'partially_paid' | 'paid' | 'disputed' | 'written_off' | 'blocked';
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected';
export type ExceptionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ExceptionStatus =
  | 'detected'
  | 'classified'
  | 'severity_determined'
  | 'owner_assigned'
  | 'recommended'
  | 'pending_approval'
  | 'approved'
  | 'executed'
  | 'verified'
  | 'rejected'
  | 'closed';

export interface Customer {
  id: string;
  organization_id: string;
  source_system: string;
  source_id: string;
  name: string;
  tax_id?: string | null;
  billing_address?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  credit_limit_minor_units: number; // Integer minor units (e.g. Paise)
  currency: string; // ISO 4217 code (e.g. INR)
  payment_terms_days: number;
  risk_score?: number | null;
  parent_customer_id?: string | null;
  owner_user_id?: string | null;
  industry?: string | null;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  source_sheet_name?: string | null;
  source_row_number?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerContact {
  id: string;
  organization_id: string;
  customer_id: string;
  name: string;
  email: string;
  phone?: string | null;
  role_title?: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  organization_id: string;
  source_system: string;
  source_id: string;
  customer_id: string;
  number: string;
  amount_minor_units: number; // Integer minor units
  currency: string;
  tax_amount_minor_units: number;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  po_reference?: string | null;
  delivery_reference?: string | null;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  source_sheet_name?: string | null;
  source_row_number?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  organization_id: string;
  source_system: string;
  source_id: string;
  customer_id: string;
  amount_minor_units: number;
  currency: string;
  date: string;
  reference?: string | null;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  source_sheet_name?: string | null;
  source_row_number?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentInvoiceMatch {
  id: string;
  organization_id: string;
  payment_id: string;
  invoice_id: string;
  matched_amount_minor_units: number;
  confidence?: number | null;
  match_method?: 'deterministic' | 'fuzzy' | 'manual' | null;
  created_at: string;
}

export type BankTransactionStatus = 'unmatched' | 'pending_approval' | 'matched' | 'ignored';

export interface BankTransaction {
  id: string;
  organization_id: string;
  source_system: string; // 'manual_upload' | 'account_aggregator_api'
  raw_reference: string;
  amount_minor_units: number;
  currency: string;
  date: string;
  narration_text: string;
  status: BankTransactionStatus;
  matched_payment_id?: string | null;
  matched_invoice_ids?: string[];
  confidence?: number | null;
  match_method?: 'deterministic' | 'fuzzy' | null;
  rejection_reason?: string | null;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditNote {
  id: string;
  organization_id: string;
  source_system: string;
  source_id: string;
  customer_id: string;
  amount_minor_units: number;
  currency: string;
  date: string;
  reason?: string | null;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Dispute {
  id: string;
  organization_id: string;
  invoice_id: string;
  reason: string;
  amount_minor_units?: number | null;
  status: DisputeStatus;
  resolution?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisputeEvidence {
  id: string;
  organization_id: string;
  dispute_id: string;
  file_name: string;
  file_url: string;
  file_type?: string | null;
  uploaded_by_user_id?: string | null;
  created_at: string;
}

export interface ExceptionRecord {
  id: string;
  organization_id: string;
  customer_id?: string | null;
  invoice_id?: string | null;
  type: string; // Plain string for future taxonomy alignment
  severity: ExceptionSeverity;
  owner_user_id?: string | null;
  evidence?: Record<string, unknown>;
  reason?: string | null;
  recommended_action?: string | null;
  resolution?: string | null;
  status: ExceptionStatus;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  source_sheet_name?: string | null;
  source_row_number?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}
