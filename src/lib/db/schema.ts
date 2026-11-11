import { pgTable, text, timestamp, integer, bigint, pgEnum, uuid, primaryKey, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// ENUM DEFINITIONS
// ---------------------------------------------------------------------------
export const roleEnum = pgEnum('role_enum', ['Admin', 'Manager', 'Analyst', 'Viewer']);

export const paymentDelayCategoryEnum = pgEnum('payment_delay_category_enum', [
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
  'UNKNOWN',
]);

export const actorTypeEnum = pgEnum('actor_type_enum', ['user', 'agent', 'system']);
export const auditResultEnum = pgEnum('audit_result_enum', ['success', 'failure', 'reverted']);

// ---------------------------------------------------------------------------
// ORGANIZATIONS & TENANCY
// ---------------------------------------------------------------------------
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable('organization_members', {
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull().default('Analyst'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
  index('idx_org_members_org').on(table.organizationId),
]);

// ---------------------------------------------------------------------------
// UNIVERSAL DATA MODEL (UDM)
// ---------------------------------------------------------------------------
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code'),
  taxId: text('tax_id'),
  email: text('email'),
  phone: text('phone'),
  creditLimitMinorUnits: bigint('credit_limit_minor_units', { mode: 'number' }).notNull().default(0),
  creditTermsDays: integer('credit_terms_days').notNull().default(30),
  riskScore: integer('risk_score').notNull().default(50),
  currency: text('currency').notNull().default('INR'),
  importBatchId: text('import_batch_id'),
  sourceFileName: text('source_file_name'),
  sourceSheetName: text('source_sheet_name'),
  sourceRowNumber: integer('source_row_number'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_customers_org').on(table.organizationId),
]);

export const customerContacts = pgTable('customer_contacts', {
  id: text('id').primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  role: text('role'),
  isPrimary: integer('is_primary').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_contacts_org_cust').on(table.organizationId, table.customerId),
]);

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  number: text('number').notNull(),
  issueDate: timestamp('issue_date', { withTimezone: true }).notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  amountMinorUnits: bigint('amount_minor_units', { mode: 'number' }).notNull(),
  paidAmountMinorUnits: bigint('paid_amount_minor_units', { mode: 'number' }).notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  status: text('status').notNull().default('UNPAID'),
  poNumber: text('po_number'),
  sourceSystem: text('source_system').notNull().default('MANUAL'),
  paymentDelayCategory: paymentDelayCategoryEnum('payment_delay_category').default('NORMAL_CYCLE'),
  importBatchId: text('import_batch_id'),
  sourceFileName: text('source_file_name'),
  sourceSheetName: text('source_sheet_name'),
  sourceRowNumber: integer('source_row_number'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_invoices_org_status_due').on(table.organizationId, table.status, table.dueDate),
  uniqueIndex('idx_invoices_org_number').on(table.organizationId, table.number),
]);

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
  amountMinorUnits: bigint('amount_minor_units', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  referenceNumber: text('reference_number'),
  paymentMethod: text('payment_method').notNull().default('BANK_TRANSFER'),
  importBatchId: text('import_batch_id'),
  sourceFileName: text('source_file_name'),
  sourceSheetName: text('source_sheet_name'),
  sourceRowNumber: integer('source_row_number'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_payments_org_customer').on(table.organizationId, table.customerId),
]);

// ---------------------------------------------------------------------------
// AUDIT LOGS (LAYER 26 - APPEND ONLY)
// ---------------------------------------------------------------------------
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id'),
  actorType: actorTypeEnum('actor_type').notNull().default('system'),
  actionType: text('action_type').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  beforeState: text('before_state'),
  afterState: text('after_state'),
  aiContext: text('ai_context'),
  approvalContext: text('approval_context'),
  result: auditResultEnum('result').notNull().default('success'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_logs_org_created').on(table.organizationId, table.createdAt),
]);

// ---------------------------------------------------------------------------
// BILLING & SUBSCRIPTION TABLES
// ---------------------------------------------------------------------------

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  plan_id: text('plan_id').notNull(),
  status: text('status').notNull(),
  current_period_start: timestamp('current_period_start', { withTimezone: true }).notNull(),
  current_period_end: timestamp('current_period_end', { withTimezone: true }).notNull(),
  razorpay_subscription_id: text('razorpay_subscription_id'),
  razorpay_customer_id: text('razorpay_customer_id'),
  pending_plan_id: text('pending_plan_id'),
  pending_razorpay_subscription_id: text('pending_razorpay_subscription_id'),
  billing_interval: text('billing_interval'),
  grace_period_end: timestamp('grace_period_end', { withTimezone: true }),
  cancel_at_period_end: boolean('cancel_at_period_end').default(false),
  cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_subscriptions_org').on(table.organization_id),
]);

export const usageEvents = pgTable('usage_events', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(),
  quantity: integer('quantity').notNull().default(1),
  metadata: text('metadata'),
  occurred_at: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_usage_events_org').on(table.organization_id),
]);

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  provider_event_id: text('provider_event_id').notNull().unique(),
  event_type: text('event_type').notNull(),
  razorpay_subscription_id: text('razorpay_subscription_id'),
  razorpay_payment_id: text('razorpay_payment_id'),
  processing_status: text('processing_status').notNull().default('RECEIVED'),
  retry_count: integer('retry_count').notNull().default(0),
  max_retries: integer('max_retries').notNull().default(3),
  error_message: text('error_message'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_webhook_events_org').on(table.organization_id),
  index('idx_webhook_events_status').on(table.processing_status),
]);

export const refundEvents = pgTable('refund_events', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  provider_refund_id: text('provider_refund_id').notNull().unique(),
  payment_id: text('payment_id').notNull(),
  amount_minor_units: bigint('amount_minor_units', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  status: text('status').notNull().default('PENDING'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_refund_events_org').on(table.organization_id),
]);

// ---------------------------------------------------------------------------
// UDM EXTENSION TABLES (credit notes, allocations, matches, disputes, exceptions, bank transactions)
// ---------------------------------------------------------------------------

export const paymentInvoiceMatches = pgTable('payment_invoice_matches', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  payment_id: text('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  invoice_id: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  matched_amount_minor_units: bigint('matched_amount_minor_units', { mode: 'number' }).notNull(),
  confidence: bigint('confidence', { mode: 'number' }),
  match_method: text('match_method'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_payment_invoice_matches_org').on(table.organization_id),
  index('idx_payment_invoice_matches_payment').on(table.payment_id),
  index('idx_payment_invoice_matches_invoice').on(table.invoice_id),
]);

export const creditNotes = pgTable('credit_notes', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  source_system: text('source_system').notNull().default('MANUAL'),
  source_id: text('source_id').notNull(),
  customer_id: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  amount_minor_units: bigint('amount_minor_units', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  date: timestamp('date', { withTimezone: true }).notNull(),
  reason: text('reason'),
  import_batch_id: text('import_batch_id'),
  source_file_name: text('source_file_name'),
  created_by: text('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_credit_notes_org').on(table.organization_id),
  index('idx_credit_notes_customer').on(table.customer_id),
]);

export const creditAllocations = pgTable('credit_allocations', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  credit_note_id: text('credit_note_id').notNull().references(() => creditNotes.id, { onDelete: 'cascade' }),
  invoice_id: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  allocated_amount_minor_units: bigint('allocated_amount_minor_units', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('allocated'),
  reversal_reason: text('reversal_reason'),
  reason: text('reason'),
  allocated_by: text('allocated_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_credit_allocations_org').on(table.organization_id),
  index('idx_credit_allocations_credit_note').on(table.credit_note_id),
  index('idx_credit_allocations_invoice').on(table.invoice_id),
]);

export const disputes = pgTable('disputes', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  invoice_id: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  amount_minor_units: bigint('amount_minor_units', { mode: 'number' }),
  status: text('status').notNull().default('open'),
  resolution: text('resolution'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_disputes_org').on(table.organization_id),
  index('idx_disputes_invoice').on(table.invoice_id),
]);

export const disputeEvidences = pgTable('dispute_evidences', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  dispute_id: text('dispute_id').notNull().references(() => disputes.id, { onDelete: 'cascade' }),
  file_name: text('file_name').notNull(),
  file_url: text('file_url').notNull(),
  file_type: text('file_type'),
  uploaded_by_user_id: text('uploaded_by_user_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_dispute_evidences_org').on(table.organization_id),
  index('idx_dispute_evidences_dispute').on(table.dispute_id),
]);

export const exceptions = pgTable('exceptions', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  customer_id: text('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  invoice_id: text('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  owner_user_id: text('owner_user_id'),
  evidence: text('evidence'),
  reason: text('reason'),
  recommended_action: text('recommended_action'),
  resolution: text('resolution'),
  status: text('status').notNull().default('detected'),
  import_batch_id: text('import_batch_id'),
  source_file_name: text('source_file_name'),
  source_sheet_name: text('source_sheet_name'),
  source_row_number: integer('source_row_number'),
  created_by: text('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_exceptions_org').on(table.organization_id),
  index('idx_exceptions_customer').on(table.customer_id),
  index('idx_exceptions_invoice').on(table.invoice_id),
]);

export const bankTransactions = pgTable('bank_transactions', {
  id: text('id').primaryKey(),
  organization_id: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  source_system: text('source_system').notNull(),
  raw_reference: text('raw_reference').notNull(),
  amount_minor_units: bigint('amount_minor_units', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  date: timestamp('date', { withTimezone: true }).notNull(),
  narration_text: text('narration_text').notNull(),
  status: text('status').notNull().default('unmatched'),
  matched_payment_id: text('matched_payment_id').references(() => payments.id, { onDelete: 'set null' }),
  matched_invoice_ids: text('matched_invoice_ids').array(),
  confidence: bigint('confidence', { mode: 'number' }),
  match_method: text('match_method'),
  rejection_reason: text('rejection_reason'),
  import_batch_id: text('import_batch_id'),
  source_file_name: text('source_file_name'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_bank_transactions_org').on(table.organization_id),
  index('idx_bank_transactions_status').on(table.status),
]);
