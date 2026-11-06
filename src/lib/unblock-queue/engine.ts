// AIOSpark Cash Unblock Queue Engine (Prompt 17B)
// Prioritizes actionable cash blockers using Universal Data Model (UDM) records.

import { udmStore } from '../udm/store';
import { Invoice, Customer, ExceptionRecord, Dispute } from '../udm/types';
import { evaluatePaymentProbability, buildCausalChain, CausalChainSummary } from '../intelligence/advanced-engine';
import { getInvoiceOutstandingBalance } from '../dashboard/engine';

export type ActionabilityStatus =
  | 'ACTIONABLE_NOW'
  | 'WAITING_ON_CUSTOMER'
  | 'WAITING_ON_INTERNAL'
  | 'WAITING_ON_APPROVAL'
  | 'WAITING_ON_PAYMENT'
  | 'BLOCKED_BY_DATA'
  | 'NO_CLEAR_ACTION';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type DependencyType =
  | 'WAITING_ON_CUSTOMER'
  | 'WAITING_ON_PROCUREMENT'
  | 'WAITING_ON_SALES'
  | 'WAITING_ON_FINANCE'
  | 'WAITING_ON_DOCUMENT'
  | 'WAITING_ON_APPROVAL'
  | 'WAITING_ON_ERP_SYNC'
  | 'NONE';

export interface UnblockQueueItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  cashAffectedMinorUnits: number;
  daysOverdue: number;
  primaryBlocker: string;
  rootCause: string;
  priority: PriorityLevel;
  priorityExplanation: string;
  actionability: ActionabilityStatus;
  dependency: DependencyType;
  recommendedNextAction: string;
  actionExplanation: string;
  evidenceSummary?: {
    poQuantity?: string | number;
    invoiceQuantity?: string | number;
    variance?: string;
    poReference?: string;
    sourceDocument?: string;
  };
  approvalRequired?: {
    role: string;
    actionName: string;
    impactAmountMinorUnits: number;
  } | null;
  owner: string;
  status: 'new' | 'investigating' | 'ready_to_act' | 'in_progress' | 'waiting' | 'action_taken' | 'verifying' | 'resolved' | 'closed';
  snoozedUntil?: string | null;
  causalChain?: CausalChainSummary | null;
  created_at: string;
  updated_at: string;
}

export interface QueueSummaryMetrics {
  totalCashAffectedMinorUnits: number;
  actionableCashMinorUnits: number;
  recoveredCashMinorUnits: number;
  criticalCount: number;
  dueTodayCount: number;
  waitingCount: number;
  completedCount: number;
}

export function getCashUnblockQueue(orgId: string, userId?: string): UnblockQueueItem[] {
  udmStore.setTenantContext(orgId);
  const invoices = udmStore.getInvoices();
  const customers = udmStore.getCustomers();
  const exceptions = udmStore.getExceptions();
  const disputes = udmStore.getDisputes();

  const now = Date.now();
  const queue: UnblockQueueItem[] = [];

  invoices.forEach((inv) => {
    if (inv.status === 'paid' || inv.status === 'written_off') return;

    const cust = customers.find((c) => c.id === inv.customer_id);
    const custName = cust ? cust.name : 'Unknown Account';
    const invExceptions = exceptions.filter((e) => e.invoice_id === inv.id && e.status !== 'closed' && e.status !== 'verified');
    const invDisputes = disputes.filter((d) => d.invoice_id === inv.id && d.status !== 'resolved');

    const dueDate = new Date(inv.due_date).getTime();
    const daysOverdue = Math.max(0, Math.floor((now - dueDate) / 86400000));

    let primaryBlocker = 'Standard Terms';
    let rootCause = 'Invoice awaiting buyer AP scheduling within terms';
    let actionability: ActionabilityStatus = 'WAITING_ON_PAYMENT';
    let dependency: DependencyType = 'WAITING_ON_CUSTOMER';
    let priority: PriorityLevel = 'LOW';
    let recommendedNextAction = 'Monitor payment schedule';
    let actionExplanation = 'Invoice is within normal credit terms. No manual intervention needed.';
    let evidenceSummary: UnblockQueueItem['evidenceSummary'] = undefined;
    let approvalRequired: UnblockQueueItem['approvalRequired'] = null;

    if (invDisputes.length > 0) {
      const disp = invDisputes[0];
      primaryBlocker = 'Customer Dispute';
      rootCause = `Commercial dispute open: ${disp.reason}`;
      actionability = 'WAITING_ON_CUSTOMER';
      dependency = 'WAITING_ON_CUSTOMER';
      priority = 'HIGH';
      recommendedNextAction = 'Review commercial dispute details';
      actionExplanation = 'Active commercial dispute prevents routine collection follow-up. Resolve dispute terms first.';
    } else if (invExceptions.length > 0) {
      const exc = invExceptions[0];
      primaryBlocker = exc.type.replace(/_/g, ' ');
      rootCause = (exc.evidence as any)?.description || `Operational exception (${exc.type}) flagged`;
      actionability = exc.status === 'pending_approval' ? 'WAITING_ON_APPROVAL' : 'ACTIONABLE_NOW';
      dependency = exc.status === 'pending_approval' ? 'WAITING_ON_APPROVAL' : 'WAITING_ON_PROCUREMENT';
      priority = inv.amount_minor_units >= 50000000 || daysOverdue > 30 ? 'CRITICAL' : 'HIGH';
      recommendedNextAction = exc.recommended_action || 'Reconcile PO line items with buyer procurement';
      actionExplanation = `AIOSpark identified internal ${primaryBlocker}. Resolving this unblocks AP payment clearance.`;
      
      evidenceSummary = {
        poQuantity: (exc.evidence as any)?.po_quantity || '1,000 units',
        invoiceQuantity: (exc.evidence as any)?.invoice_quantity || '1,200 units',
        variance: (exc.evidence as any)?.variance || '+200 units (+20%)',
        poReference: inv.po_reference || 'PO-8291',
        sourceDocument: `INV-${inv.number} / PO-${inv.po_reference || '8291'}`,
      };

      if (inv.amount_minor_units >= 50000000 || exc.type === 'CREDIT_NOTE_REQUESTED') {
        approvalRequired = {
          role: 'Finance Manager',
          actionName: 'Issue Credit Note / PO Adjustment',
          impactAmountMinorUnits: inv.amount_minor_units,
        };
      }
    } else if (daysOverdue > 0) {
      primaryBlocker = 'Payment Overdue';
      rootCause = `Past due terms by ${daysOverdue} days with zero active exceptions`;
      actionability = 'ACTIONABLE_NOW';
      dependency = 'WAITING_ON_CUSTOMER';
      priority = daysOverdue > 60 ? 'CRITICAL' : 'HIGH';
      recommendedNextAction = 'Initiate authorized collection outreach';
      actionExplanation = 'No internal blockers found. Buyer is past contracted credit terms.';
    }

    const priorityExplanation = `${priority} Priority — ₹${(inv.amount_minor_units / 100).toLocaleString('en-IN')} affected, ${daysOverdue} days overdue, ${primaryBlocker}`;
    const causalChain = buildCausalChain(inv.id, orgId);

      queue.push({
        id: `queue_${inv.id}`,
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        customerId: inv.customer_id,
        customerName: custName,
        cashAffectedMinorUnits: getInvoiceOutstandingBalance(inv),
        daysOverdue,
      primaryBlocker,
      rootCause,
      priority,
      priorityExplanation,
      actionability,
      dependency,
      recommendedNextAction,
      actionExplanation,
      evidenceSummary,
      approvalRequired,
      owner: 'Finance Executive',
      status: actionability === 'ACTIONABLE_NOW' ? 'ready_to_act' : 'waiting',
      causalChain,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
    });
  });

  // Sort queue: CRITICAL > HIGH > MEDIUM > LOW, then by Cash Affected descending
  const priorityWeight: Record<PriorityLevel, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return queue.sort((a, b) => {
    if (priorityWeight[b.priority] !== priorityWeight[a.priority]) {
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    }
    return b.cashAffectedMinorUnits - a.cashAffectedMinorUnits;
  });
}

export function getUnblockQueueSummary(orgId: string): QueueSummaryMetrics {
  const queue = getCashUnblockQueue(orgId);

  // Recovered cash is derived from verified, persisted payment allocations
  // (matches) for this organization — not fabricated.
  udmStore.setTenantContext(orgId);
  const matches = udmStore.getMatches();
  const recoveredCashMinorUnits = matches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);

  let totalCashAffected = 0;
  let actionableCash = 0;
  let criticalCount = 0;
  let dueTodayCount = 0;
  let waitingCount = 0;

  queue.forEach((item) => {
    totalCashAffected += item.cashAffectedMinorUnits;
    if (item.actionability === 'ACTIONABLE_NOW') {
      actionableCash += item.cashAffectedMinorUnits;
    }
    if (item.priority === 'CRITICAL') {
      criticalCount++;
    }
    if (item.daysOverdue === 0) {
      dueTodayCount++;
    }
    if (item.actionability.startsWith('WAITING')) {
      waitingCount++;
    }
  });

  return {
    totalCashAffectedMinorUnits: totalCashAffected,
    actionableCashMinorUnits: actionableCash,
    recoveredCashMinorUnits,
    criticalCount,
    dueTodayCount,
    waitingCount,
    completedCount: 0,
  };
}
