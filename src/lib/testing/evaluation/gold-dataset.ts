// AIOSPARK P1-1 — Gold Dataset
// 100 controlled evaluation cases with verified expected outcomes.
// All data is synthetic. No real customer or financial data is used.

import { EvaluationCase, EvaluationCategory, EvaluationDifficulty } from './types';
import { Customer, Invoice, Payment, ExceptionRecord, Dispute } from '../../udm/types';

const ORG_ID = 'org_eval_gold_001';

/* ============================================================================
   HELPERS
   ============================================================================ */

function makeCustomer(
  id: string,
  name: string,
  creditLimit: number,
  paymentTerms: number = 30
): Customer {
  return {
    id,
    organization_id: ORG_ID,
    source_system: 'manual',
    source_id: `src_${id}`,
    name,
    credit_limit_minor_units: creditLimit,
    currency: 'INR',
    payment_terms_days: paymentTerms,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makeInvoice(
  id: string,
  customerId: string,
  number: string,
  amount: number,
  dueDate: string,
  status: Invoice['status'] = 'open',
  poReference?: string | null
): Invoice {
  return {
    id,
    organization_id: ORG_ID,
    source_system: 'manual',
    source_id: `src_${id}`,
    customer_id: customerId,
    number,
    amount_minor_units: amount,
    tax_amount_minor_units: Math.round(amount * 0.18),
    currency: 'INR',
    issue_date: '2026-08-01',
    due_date: dueDate,
    status,
    po_reference: poReference,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
}

function makePayment(
  id: string,
  customerId: string,
  amount: number,
  date: string,
  reference?: string
): Payment {
  return {
    id,
    organization_id: ORG_ID,
    source_system: 'manual',
    source_id: `src_${id}`,
    customer_id: customerId,
    amount_minor_units: amount,
    currency: 'INR',
    date,
    reference,
    created_at: date,
    updated_at: date,
  };
}

function makeException(
  id: string,
  invoiceId: string,
  type: string,
  severity: ExceptionRecord['severity'] = 'high',
  status: ExceptionRecord['status'] = 'detected',
  recommendedAction?: string
): ExceptionRecord {
  return {
    id,
    organization_id: ORG_ID,
    customer_id: null,
    invoice_id: invoiceId,
    type,
    severity,
    owner_user_id: null,
    evidence: { description: `Exception: ${type}` },
    recommended_action: recommendedAction || `Resolve ${type}`,
    resolution: null,
    status,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
}

function makeDispute(
  id: string,
  invoiceId: string,
  reason: string,
  status: Dispute['status'] = 'open'
): Dispute {
  return {
    id,
    organization_id: ORG_ID,
    invoice_id: invoiceId,
    reason,
    amount_minor_units: null,
    status,
    resolution: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
}

/* ============================================================================
   GOLD DATASET — 100 CASES
   ============================================================================ */

export const GOLD_DATASET: EvaluationCase[] = [];

/* --------------------------------------------------------------------------
   CATEGORY 1: Invoice Discrepancies (25 cases)
   -------------------------------------------------------------------------- */

for (let i = 1; i <= 25; i++) {
  const cust = makeCustomer(
    `cust_disc_${i}`,
    `Discrepancy Customer ${i}`,
    100000000
  );
  const inv = makeInvoice(
    `inv_disc_${i}`,
    cust.id,
    `INV-DISC-${String(i).padStart(3, '0')}`,
    50000000 + i * 1000000, // ₹50L to ₹74L
    '2026-09-30',
    'open'
  );
  const outstanding = inv.amount_minor_units;

  GOLD_DATASET.push({
    id: `CASE-DISC-${String(i).padStart(3, '0')}`,
    title: `Invoice Discrepancy ${i}: ${inv.number}`,
    description: `Invoice ${inv.number} for ₹${(inv.amount_minor_units / 100).toLocaleString('en-IN')} shows billing discrepancy requiring investigation.`,
    category: 'INVOICE_DISCREPANCY',
    difficulty: i <= 10 ? 'SIMPLE' : i <= 20 ? 'INTERMEDIATE' : 'COMPLEX',
    organizationId: ORG_ID,
    sourceCustomer: cust,
    sourceInvoice: inv,
    sourcePayments: [],
    sourceExceptions: [],
    sourceDisputes: [],
    groundTruthFinancials: {
      totalInvoiceAmountMinorUnits: inv.amount_minor_units,
      paidAmountMinorUnits: 0,
      outstandingAmountMinorUnits: outstanding,
      taxAmountMinorUnits: inv.tax_amount_minor_units,
      expectedActionableAmountMinorUnits: outstanding,
    },
    groundTruthEvidence: {
      expectedEvidenceLabels: ['Invoice Number', 'Invoice Amount', 'Due Date', 'Status'],
      forbiddenEvidenceLabels: ['PO Reference', 'Delivery Reference'],
      expectedInvoiceNumbers: [inv.number],
      expectedPoReferences: [],
    },
    groundTruthDiagnosis: {
      expectedCategory: 'INVOICE_DISCREPANCY',
      expectedRootCause: 'Billing discrepancy detected',
      expectedConfidenceMin: 0.7,
      expectedConfidenceMax: 0.95,
      expectedConclusionContains: [inv.number, 'discrepancy'],
      expectedConclusionExcludes: ['PO mismatch', 'payment received'],
    },
    groundTruthAction: {
      acceptableActionTypes: ['REQUEST_INFORMATION', 'SEND_CUSTOMER_COMMUNICATION'],
      acceptableActionLabels: [],
      disallowedActionTypes: ['ISSUE_CREDIT_NOTE', 'RECORD_PAYMENT_MATCH'],
      expectedRiskLevel: 'LOW',
      expectedApprovalRequired: false,
    },
    createdAt: '2026-08-01T00:00:00Z',
    tags: ['discrepancy', 'billing', 'investigation'],
  });
}

/* --------------------------------------------------------------------------
   CATEGORY 2: Overdue Payment Investigations (25 cases)
   -------------------------------------------------------------------------- */

for (let i = 1; i <= 25; i++) {
  const cust = makeCustomer(
    `cust_overdue_${i}`,
    `Overdue Customer ${i}`,
    80000000
  );
  const inv = makeInvoice(
    `inv_overdue_${i}`,
    cust.id,
    `INV-OVERDUE-${String(i).padStart(3, '0')}`,
    30000000 + i * 500000, // ₹30L to ₹42L
    '2026-08-15', // Overdue as of evaluation date
    'open'
  );
  const outstanding = inv.amount_minor_units;

  GOLD_DATASET.push({
    id: `CASE-OVERDUE-${String(i).padStart(3, '0')}`,
    title: `Overdue Payment ${i}: ${inv.number}`,
    description: `Invoice ${inv.number} is past due by ${i} days. Customer has not responded to reminders.`,
    category: 'OVERDUE_PAYMENT',
    difficulty: i <= 10 ? 'SIMPLE' : i <= 20 ? 'INTERMEDIATE' : 'COMPLEX',
    organizationId: ORG_ID,
    sourceCustomer: cust,
    sourceInvoice: inv,
    sourcePayments: [],
    sourceExceptions: [],
    sourceDisputes: [],
    groundTruthFinancials: {
      totalInvoiceAmountMinorUnits: inv.amount_minor_units,
      paidAmountMinorUnits: 0,
      outstandingAmountMinorUnits: outstanding,
      taxAmountMinorUnits: inv.tax_amount_minor_units,
      expectedActionableAmountMinorUnits: outstanding,
    },
    groundTruthEvidence: {
      expectedEvidenceLabels: ['Invoice Number', 'Invoice Amount', 'Due Date', 'Status', 'Days Overdue'],
      forbiddenEvidenceLabels: ['Payment Received', 'Credit Note Issued'],
      expectedInvoiceNumbers: [inv.number],
      expectedPoReferences: [],
    },
    groundTruthDiagnosis: {
      expectedCategory: 'OVERDUE_PAYMENT',
      expectedRootCause: 'Payment past contracted credit terms',
      expectedConfidenceMin: 0.8,
      expectedConfidenceMax: 0.98,
      expectedConclusionContains: [inv.number, 'overdue', 'past due'],
      expectedConclusionExcludes: ['payment received', 'dispute resolved'],
    },
    groundTruthAction: {
      acceptableActionTypes: ['SEND_CUSTOMER_COMMUNICATION', 'FOLLOW_UP_ON_PAYMENT_PROMISE'],
      acceptableActionLabels: [],
      disallowedActionTypes: ['ISSUE_CREDIT_NOTE', 'RECORD_PAYMENT_MATCH'],
      expectedRiskLevel: outstanding >= 50000000 ? 'HIGH' : 'MEDIUM',
      expectedApprovalRequired: outstanding >= 50000000,
    },
    createdAt: '2026-08-01T00:00:00Z',
    tags: ['overdue', 'collection', 'payment'],
  });
}

/* --------------------------------------------------------------------------
   CATEGORY 3: PO Mismatches (20 cases)
   -------------------------------------------------------------------------- */

for (let i = 1; i <= 20; i++) {
  const cust = makeCustomer(
    `cust_po_${i}`,
    `PO Customer ${i}`,
    120000000
  );
  const inv = makeInvoice(
    `inv_po_${i}`,
    cust.id,
    `INV-PO-${String(i).padStart(3, '0')}`,
    40000000 + i * 2000000, // ₹40L to ₹78L
    '2026-09-15',
    'open',
    `PO-EVAL-${String(i).padStart(3, '0')}`
  );
  const poQty = 1000 + i * 50;
  const invQty = poQty - 50; // Invoice underbills PO by 50 units

  GOLD_DATASET.push({
    id: `CASE-PO-${String(i).padStart(3, '0')}`,
    title: `PO Mismatch ${i}: ${inv.number}`,
    description: `Invoice ${inv.number} quantity (${invQty}) differs from PO ${inv.po_reference} quantity (${poQty}).`,
    category: 'PO_MISMATCH',
    difficulty: i <= 8 ? 'SIMPLE' : i <= 16 ? 'INTERMEDIATE' : 'COMPLEX',
    organizationId: ORG_ID,
    sourceCustomer: cust,
    sourceInvoice: inv,
    sourcePayments: [],
    sourceExceptions: [
      makeException(
        `exc_po_${i}`,
        inv.id,
        'PO_MISMATCH',
        'high',
        'detected',
        'Reconcile PO line items with procurement'
      ),
    ],
    sourceDisputes: [],
    groundTruthFinancials: {
      totalInvoiceAmountMinorUnits: inv.amount_minor_units,
      paidAmountMinorUnits: 0,
      outstandingAmountMinorUnits: inv.amount_minor_units,
      taxAmountMinorUnits: inv.tax_amount_minor_units,
      expectedActionableAmountMinorUnits: inv.amount_minor_units,
    },
    groundTruthEvidence: {
      expectedEvidenceLabels: ['PO Reference', 'PO Quantity', 'Invoice Quantity', 'Variance'],
      forbiddenEvidenceLabels: ['Payment Received', 'Credit Note'],
      expectedInvoiceNumbers: [inv.number],
      expectedPoReferences: [inv.po_reference!],
    },
    groundTruthDiagnosis: {
      expectedCategory: 'PO_MISMATCH',
      expectedRootCause: 'Invoice quantity differs from approved PO line item',
      expectedConfidenceMin: 0.85,
      expectedConfidenceMax: 0.98,
      expectedConclusionContains: [inv.number, inv.po_reference!, 'PO mismatch', 'quantity'],
      expectedConclusionExcludes: ['payment received', 'dispute resolved'],
    },
    groundTruthAction: {
      acceptableActionTypes: ['REQUEST_INFORMATION', 'REQUEST_PO_REVIEW'],
      acceptableActionLabels: [],
      disallowedActionTypes: ['ISSUE_CREDIT_NOTE', 'RECORD_PAYMENT_MATCH'],
      expectedRiskLevel: 'MEDIUM',
      expectedApprovalRequired: false,
    },
    createdAt: '2026-08-01T00:00:00Z',
    tags: ['po_mismatch', 'procurement', 'exception'],
  });
}

/* --------------------------------------------------------------------------
   CATEGORY 4: Payment Reconciliation (15 cases)
   -------------------------------------------------------------------------- */

for (let i = 1; i <= 15; i++) {
  const cust = makeCustomer(
    `cust_recon_${i}`,
    `Reconciliation Customer ${i}`,
    90000000
  );
  const inv = makeInvoice(
    `inv_recon_${i}`,
    cust.id,
    `INV-RECON-${String(i).padStart(3, '0')}`,
    25000000 + i * 1000000, // ₹25L to ₹39L
    '2026-09-20',
    'open'
  );
  const paid = Math.floor(inv.amount_minor_units * 0.6); // 60% paid
  const outstanding = inv.amount_minor_units - paid;

  GOLD_DATASET.push({
    id: `CASE-RECON-${String(i).padStart(3, '0')}`,
    title: `Payment Reconciliation ${i}: ${inv.number}`,
    description: `Invoice ${inv.number} has partial payment of ₹${(paid / 100).toLocaleString('en-IN')} against total of ₹${(inv.amount_minor_units / 100).toLocaleString('en-IN')}.`,
    category: 'PAYMENT_RECONCILIATION',
    difficulty: i <= 6 ? 'SIMPLE' : i <= 12 ? 'INTERMEDIATE' : 'COMPLEX',
    organizationId: ORG_ID,
    sourceCustomer: cust,
    sourceInvoice: inv,
    sourcePayments: [
      makePayment(`pay_recon_${i}`, cust.id, paid, '2026-09-10', `REF-${String(i).padStart(3, '0')}`),
    ],
    sourceExceptions: [],
    sourceDisputes: [],
    groundTruthFinancials: {
      totalInvoiceAmountMinorUnits: inv.amount_minor_units,
      paidAmountMinorUnits: paid,
      outstandingAmountMinorUnits: outstanding,
      taxAmountMinorUnits: inv.tax_amount_minor_units,
      expectedActionableAmountMinorUnits: outstanding,
    },
    groundTruthEvidence: {
      expectedEvidenceLabels: ['Invoice Number', 'Invoice Amount', 'Payment Amount', 'Outstanding Balance'],
      forbiddenEvidenceLabels: ['Credit Note Issued', 'Full Payment Received'],
      expectedInvoiceNumbers: [inv.number],
      expectedPoReferences: [],
    },
    groundTruthDiagnosis: {
      expectedCategory: 'PAYMENT_RECONCILIATION',
      expectedRootCause: 'Partial payment received, balance outstanding',
      expectedConfidenceMin: 0.8,
      expectedConfidenceMax: 0.95,
      expectedConclusionContains: [inv.number, 'partial payment', 'outstanding'],
      expectedConclusionExcludes: ['full payment received', 'dispute'],
    },
    groundTruthAction: {
      acceptableActionTypes: ['SEND_CUSTOMER_COMMUNICATION', 'FOLLOW_UP_ON_PAYMENT_PROMISE'],
      acceptableActionLabels: [],
      disallowedActionTypes: ['ISSUE_CREDIT_NOTE', 'RECORD_PAYMENT_MATCH'],
      expectedRiskLevel: outstanding >= 30000000 ? 'HIGH' : 'MEDIUM',
      expectedApprovalRequired: outstanding >= 30000000,
    },
    createdAt: '2026-08-01T00:00:00Z',
    tags: ['reconciliation', 'partial_payment', 'outstanding'],
  });
}

/* --------------------------------------------------------------------------
   CATEGORY 5: Next-Best-Action (15 cases)
   -------------------------------------------------------------------------- */

const nbaScenarios = [
  { blocker: 'PO_MISMATCH', action: 'REQUEST_PO_REVIEW', team: 'Procurement', risk: 'MEDIUM' as const, approval: false },
  { blocker: 'CUSTOMER_DISPUTE', action: 'RESOLVE_DISPUTE', team: 'Customer AP', risk: 'HIGH' as const, approval: true },
  { blocker: 'MISSING_POD', action: 'REQUEST_DELIVERY_CONFIRMATION', team: 'Operations', risk: 'LOW' as const, approval: false },
  { blocker: 'CREDIT_NOTE_REQUESTED', action: 'REQUEST_CREDIT_ADJUSTMENT_APPROVAL', team: 'Management', risk: 'HIGH' as const, approval: true },
  { blocker: 'TAX_VARIANCE', action: 'REQUEST_TAX_REVIEW', team: 'Finance', risk: 'MEDIUM' as const, approval: false },
  { blocker: 'AP_APPROVAL_PENDING', action: 'WAIT_FOR_BUYER_AP', team: 'Customer AP', risk: 'LOW' as const, approval: false },
  { blocker: 'BANK_RECONCILIATION_PENDING', action: 'MATCH_PAYMENT', team: 'Finance', risk: 'LOW' as const, approval: false },
  { blocker: 'INVOICE_ERROR', action: 'CORRECT_INVOICE_DATA', team: 'Finance Executive', risk: 'MEDIUM' as const, approval: true },
  { blocker: 'NORMAL_CYCLE', action: 'MONITOR_PAYMENT_SCHEDULE', team: 'Finance Executive', risk: 'LOW' as const, approval: false },
  { blocker: 'BROKEN_PROMISE', action: 'FOLLOW_UP_ON_BROKEN_PROMISE', team: 'Collections', risk: 'HIGH' as const, approval: false },
];

for (let i = 1; i <= 15; i++) {
  const scenario = nbaScenarios[(i - 1) % nbaScenarios.length];
  const cust = makeCustomer(
    `cust_nba_${i}`,
    `NBA Customer ${i}`,
    70000000
  );
  const inv = makeInvoice(
    `inv_nba_${i}`,
    cust.id,
    `INV-NBA-${String(i).padStart(3, '0')}`,
    35000000 + i * 1500000, // ₹35L to ₹56L
    '2026-09-25',
    'open',
    scenario.blocker === 'PO_MISMATCH' ? `PO-NBA-${String(i).padStart(3, '0')}` : null
  );

  GOLD_DATASET.push({
    id: `CASE-NBA-${String(i).padStart(3, '0')}`,
    title: `Next-Best-Action ${i}: ${inv.number}`,
    description: `Invoice ${inv.number} has ${scenario.blocker} blocker. Recommend the correct next action.`,
    category: 'NEXT_BEST_ACTION',
    difficulty: i <= 6 ? 'SIMPLE' : i <= 12 ? 'INTERMEDIATE' : 'COMPLEX',
    organizationId: ORG_ID,
    sourceCustomer: cust,
    sourceInvoice: inv,
    sourcePayments: [],
    sourceExceptions: scenario.blocker !== 'NORMAL_CYCLE'
      ? [makeException(`exc_nba_${i}`, inv.id, scenario.blocker, 'high', 'detected', `Resolve ${scenario.blocker}`)]
      : [],
    sourceDisputes: scenario.blocker === 'CUSTOMER_DISPUTE'
      ? [makeDispute(`disp_nba_${i}`, inv.id, 'Commercial dispute open')]
      : [],
    groundTruthFinancials: {
      totalInvoiceAmountMinorUnits: inv.amount_minor_units,
      paidAmountMinorUnits: 0,
      outstandingAmountMinorUnits: inv.amount_minor_units,
      taxAmountMinorUnits: inv.tax_amount_minor_units,
      expectedActionableAmountMinorUnits: inv.amount_minor_units,
    },
    groundTruthEvidence: {
      expectedEvidenceLabels: ['Invoice Number', 'Invoice Amount', 'Blocker Type'],
      forbiddenEvidenceLabels: ['Payment Received', 'Credit Note'],
      expectedInvoiceNumbers: [inv.number],
      expectedPoReferences: inv.po_reference ? [inv.po_reference] : [],
    },
    groundTruthDiagnosis: {
      expectedCategory: scenario.blocker,
      expectedRootCause: scenario.blocker.replace(/_/g, ' '),
      expectedConfidenceMin: 0.7,
      expectedConfidenceMax: 0.95,
      expectedConclusionContains: [inv.number, scenario.blocker],
      expectedConclusionExcludes: ['payment received', 'resolved'],
    },
    groundTruthAction: {
      acceptableActionTypes: [scenario.action],
      acceptableActionLabels: [],
      disallowedActionTypes: ['ISSUE_CREDIT_NOTE', 'RECORD_PAYMENT_MATCH'],
      expectedRiskLevel: scenario.risk,
      expectedApprovalRequired: scenario.approval,
    },
    createdAt: '2026-08-01T00:00:00Z',
    tags: ['next_best_action', scenario.blocker.toLowerCase(), scenario.team.toLowerCase()],
  });
}

/* ============================================================================
   EXPORTS
   ============================================================================ */

export const GOLD_DATASET_COUNTS: Record<EvaluationCategory, number> = {
  INVOICE_DISCREPANCY: 25,
  OVERDUE_PAYMENT: 25,
  PO_MISMATCH: 20,
  PAYMENT_RECONCILIATION: 15,
  NEXT_BEST_ACTION: 15,
};

export function getCasesByCategory(category: EvaluationCategory): EvaluationCase[] {
  return GOLD_DATASET.filter((c) => c.category === category);
}

export function getCasesByDifficulty(difficulty: EvaluationDifficulty): EvaluationCase[] {
  return GOLD_DATASET.filter((c) => c.difficulty === difficulty);
}

export function getCaseById(id: string): EvaluationCase | undefined {
  return GOLD_DATASET.find((c) => c.id === id);
}
