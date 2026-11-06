import { pgTable, text, timestamp, integer, bigint, pgEnum, uuid, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';

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
