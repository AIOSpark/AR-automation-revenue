// AIOSpark Collections Intelligence Server-Side Query & Prioritization Engine
// Ranks receivables deterministically by financial exposure, overdue days, broken promises, and active exceptions.

import { udmStore } from '../udm/store';
import { promiseStore, PaymentPromise, PromiseStatus } from '../promises/store';
import { communicationStore, SentMessage } from '../communication/store';
import { Invoice, Customer, ExceptionRecord } from '../udm/types';
import { computeCustomerFinancialProfile } from '../customer/risk-engine';
import { getInvoiceOutstandingBalance } from '../dashboard/engine';
import { formatINR, calculateAgeDays } from '../exceptions/query-engine';

export interface CollectionsQueryFilters {
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'all';
  risk?: 'high' | 'medium' | 'low' | 'all';
  promiseStatus?: 'all' | 'pending' | 'kept' | 'broken' | 'partial';
  hasBlocker?: 'all' | 'yes' | 'no';
  customerId?: string;
  ownerId?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  minAgeDays?: number;
  maxAgeDays?: number;
  sortBy?: 'priority' | 'amount' | 'age' | 'promise' | 'risk';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CollectionItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerIndustry?: string | null;
  amountMinorUnits: number;
  outstandingMinorUnits: number;
  outstandingFormatted: string;
  dueDate: string;
  daysOverdue: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priorityReason: string;
  riskBand: 'high' | 'medium' | 'low';
  hasBlocker: boolean;
  blockerType?: string | null;
  blockerRecommendation?: string | null;
  promiseId?: string | null;
  promiseStatus?: PromiseStatus | null;
  promiseDate?: string | null;
  lastContactDate?: string | null;
  lastContactChannel?: string | null;
  ownerId: string | null;
  ownerLabel: string;
  nextBestAction: string;
  nextBestActionReason: string;
  approvalRequired: boolean;
}

export interface CollectionsQueryResult {
  items: CollectionItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kpis: {
    totalOverdueMinorUnits: number;
    totalOverdueFormatted: string;
    dueTodayCount: number;
    highPriorityCount: number;
    promisesDueCount: number;
    brokenPromisesCount: number;
    unassignedCount: number;
    actionableMinorUnits: number;
    actionableFormatted: string;
    recoveredCashMinorUnits: number;
    recoveredCashFormatted: string;
  };
  aging: Array<{
    bucket: string;
    count: number;
    amountMinorUnits: number;
    amountFormatted: string;
  }>;
  brokenPromisesList: Array<{
    promiseId: string;
    customerName: string;
    invoiceNumber: string;
    promisedAmountFormatted: string;
    expectedDate: string;
    daysSincePromise: number;
    outstandingFormatted: string;
    nextAction: string;
  }>;
}

/** Deterministically computes collection priority level & explanation */
export function calculateCollectionPriority(
  outstandingMinorUnits: number,
  daysOverdue: number,
  hasBrokenPromise: boolean,
  hasBlocker: boolean,
  riskBand: 'high' | 'medium' | 'low'
): { priority: 'critical' | 'high' | 'medium' | 'low'; reason: string } {
  // CRITICAL: High amount (>= ₹5L) + Overdue >= 30d OR Broken promise on High Risk Customer
  if (hasBrokenPromise && (outstandingMinorUnits >= 10000000 || riskBand === 'high')) {
    return {
      priority: 'critical',
      reason: 'Broken payment promise with high financial exposure or elevated customer risk.',
    };
  }

  if (outstandingMinorUnits >= 50000000 && daysOverdue >= 30) { // ₹5L+ & 30d+
    return {
      priority: 'critical',
      reason: 'High financial exposure (≥₹5L) severely overdue.',
    };
  }

  // HIGH: Broken promise OR Overdue >= 30d OR Amount >= ₹1L
  if (hasBrokenPromise) {
    return {
      priority: 'high',
      reason: 'Customer payment promise date has passed without matching payment.',
    };
  }

  if (outstandingMinorUnits >= 10000000 && daysOverdue >= 15) { // ₹1L+ & 15d+
    return {
      priority: 'high',
      reason: 'Substantial outstanding balance (≥₹1L) past due date.',
    };
  }

  if (daysOverdue >= 45) {
    return {
      priority: 'high',
      reason: 'Invoice overdue for over 45 days.',
    };
  }

  // MEDIUM: Overdue >= 15d OR Has Active Blocker
  if (daysOverdue >= 15 || hasBlocker) {
    return {
      priority: 'medium',
      reason: hasBlocker ? 'Receivable has an active exception blocker requiring resolution.' : 'Invoice moderately overdue (15–30 days).',
    };
  }

  // LOW: Minor overdue
  return {
    priority: 'low',
    reason: 'Standard payment follow-up within normal operating window.',
  };
}

/** Determines Next Best Action considering Exceptions & Promises (Exception-Aware Collections) */
export function determineNextBestAction(
  invoiceNumber: string,
  daysOverdue: number,
  hasBlocker: boolean,
  blockerType?: string | null,
  promiseStatus?: string | null,
  promiseDate?: string | null
): { action: string; reason: string; approvalRequired: boolean } {
  // 1. Exception-Aware Guardrail: Blocker resolution takes priority over chasing
  if (hasBlocker && blockerType) {
    return {
      action: `Resolve ${blockerType.replace(/_/g, ' ')} blocker before collection escalation`,
      reason: `Invoice has active blocker (${blockerType}). Fix root cause prior to sending aggressive follow-ups.`,
      approvalRequired: false,
    };
  }

  // 2. Broken Promise Guardrail
  if (promiseStatus === 'broken') {
    return {
      action: 'Follow up on broken payment promise',
      reason: `Customer committed to payment on ${promiseDate || 'recent date'} which has passed without payment arrival.`,
      approvalRequired: true,
    };
  }

  // 3. Pending Promise Guardrail
  if (promiseStatus === 'pending') {
    return {
      action: 'Wait for promised payment date',
      reason: `Customer has an active promise to pay on ${promiseDate}. Do not double-contact.`,
      approvalRequired: false,
    };
  }

  // 4. Overdue Escalation
  if (daysOverdue >= 30) {
    return {
      action: 'Request internal approval for formal escalation',
      reason: 'Invoice is severely overdue (≥30 days). Send formal dunning communication.',
      approvalRequired: true,
    };
  }

  return {
    action: 'Send friendly payment reminder',
    reason: 'Standard payment reminder for recently overdue invoice.',
    approvalRequired: false,
  };
}

/** Main query function for Collections Intelligence Workspace */
export function queryCollectionsWorkspace(
  orgId: string,
  filters: CollectionsQueryFilters = {},
  todayStr?: string
): CollectionsQueryResult {
  // orgId is derived from the active AsyncLocalStorage request context
  const activeOrgId = udmStore.getRequestTenant();
  if (!activeOrgId) {
    throw new Error('Missing tenant context: orgId not available in current request context');
  }
  const today = todayStr || new Date().toISOString().split('T')[0];
  const todayMs = new Date(today).getTime();

  const invoices = udmStore.getInvoices();
  const customers = udmStore.getCustomers();
  const exceptions = udmStore.getExceptions();
  const promises = promiseStore.getPromises(activeOrgId);
  const sentMessages = communicationStore.getSentMessages(activeOrgId);
  const matches = udmStore.getMatches();

  const customerMap = new Map<string, Customer>(customers.map((c) => [c.id, c]));

  // Build list of overdue & actionable receivables
  const eligibleInvoices = invoices.filter((inv) => inv.status !== 'paid' && inv.status !== 'written_off');

  const items: CollectionItem[] = eligibleInvoices.map((inv) => {
    const cust = customerMap.get(inv.customer_id);
    const customerName = cust ? cust.name : 'Unknown Customer';
    const outstandingMinorUnits = getInvoiceOutstandingBalance(inv);

    const dueMs = new Date(inv.due_date).getTime();
    const daysOverdue = inv.due_date < today ? Math.max(0, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24))) : 0;

    // Check risk profile
    const riskProfile = computeCustomerFinancialProfile(inv.customer_id, activeOrgId, today);
    const riskBand = riskProfile.riskBand;

    // Check active exception blocker
    const activeExc = exceptions.find(
      (e) => e.invoice_id === inv.id && !['closed', 'rejected'].includes(e.status)
    );
    const hasBlocker = !!activeExc;
    const blockerType = activeExc ? activeExc.type : null;
    const blockerRecommendation = activeExc ? activeExc.recommended_action : null;

    // Check promises
    const invPromise = promises.find((p) => p.invoice_id === inv.id || (p.customer_id === inv.customer_id && p.status === 'pending'));
    const promiseStatus = invPromise ? invPromise.status : null;
    const promiseDate = invPromise ? invPromise.expected_date : null;
    const hasBrokenPromise = promiseStatus === 'broken';

    // Check last contact
    const invMessages = sentMessages.filter((m) => m.invoice_id === inv.id || m.customer_id === inv.customer_id);
    invMessages.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    const lastMsg = invMessages.length > 0 ? invMessages[0] : null;

    // Compute Priority
    const { priority, reason: priorityReason } = calculateCollectionPriority(
      outstandingMinorUnits,
      daysOverdue,
      hasBrokenPromise,
      hasBlocker,
      riskBand
    );

    // Compute Next Best Action
    const { action: nextBestAction, reason: nextBestActionReason, approvalRequired } = determineNextBestAction(
      inv.number,
      daysOverdue,
      hasBlocker,
      blockerType,
      promiseStatus,
      promiseDate
    );

    let ownerLabel = 'Unassigned';
    if (cust?.owner_user_id) {
      ownerLabel = cust.owner_user_id;
    }

    return {
      id: `col_${inv.id}`,
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      customerId: inv.customer_id,
      customerName,
      customerIndustry: cust?.industry || null,
      amountMinorUnits: inv.amount_minor_units,
      outstandingMinorUnits,
      outstandingFormatted: formatINR(outstandingMinorUnits),
      dueDate: inv.due_date,
      daysOverdue,
      priority,
      priorityReason,
      riskBand,
      hasBlocker,
      blockerType,
      blockerRecommendation,
      promiseId: invPromise ? invPromise.id : null,
      promiseStatus,
      promiseDate,
      lastContactDate: lastMsg ? lastMsg.sent_at.split('T')[0] : null,
      lastContactChannel: lastMsg ? lastMsg.channel : null,
      ownerId: cust?.owner_user_id || null,
      ownerLabel,
      nextBestAction,
      nextBestActionReason,
      approvalRequired,
    };
  });

  // Calculate KPIs across actual tenant dataset
  const overdueItems = items.filter((i) => i.daysOverdue > 0);
  const totalOverdueSum = overdueItems.reduce((sum, i) => sum + i.outstandingMinorUnits, 0);
  const dueTodayCount = items.filter((i) => i.dueDate === today || (i.daysOverdue > 0 && i.daysOverdue <= 3)).length;
  const highPriorityCount = items.filter((i) => i.priority === 'critical' || i.priority === 'high').length;
  const promisesDueCount = promises.filter((p) => p.status === 'pending' && p.expected_date <= today).length;
  const brokenPromisesCount = promises.filter((p) => p.status === 'broken').length;
  const unassignedCount = items.filter((i) => !i.ownerId).length;

  const actionableSum = items
    .filter((i) => !i.hasBlocker && i.promiseStatus !== 'pending')
    .reduce((sum, i) => sum + i.outstandingMinorUnits, 0);

  // VERIFIED RECOVERED CASH CALCULATION: Sum of payments matched to cleared invoices
  const paidMatchedSum = matches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);

  // Aging calculation
  const agingMap = {
    'Current': { count: 0, amount: 0 },
    '1-30 days': { count: 0, amount: 0 },
    '31-60 days': { count: 0, amount: 0 },
    '61-90 days': { count: 0, amount: 0 },
    '90+ days': { count: 0, amount: 0 },
  };

  items.forEach((i) => {
    if (i.daysOverdue === 0) {
      agingMap['Current'].count += 1;
      agingMap['Current'].amount += i.outstandingMinorUnits;
    } else if (i.daysOverdue <= 30) {
      agingMap['1-30 days'].count += 1;
      agingMap['1-30 days'].amount += i.outstandingMinorUnits;
    } else if (i.daysOverdue <= 60) {
      agingMap['31-60 days'].count += 1;
      agingMap['31-60 days'].amount += i.outstandingMinorUnits;
    } else if (i.daysOverdue <= 90) {
      agingMap['61-90 days'].count += 1;
      agingMap['61-90 days'].amount += i.outstandingMinorUnits;
    } else {
      agingMap['90+ days'].count += 1;
      agingMap['90+ days'].amount += i.outstandingMinorUnits;
    }
  });

  const aging = Object.entries(agingMap).map(([bucket, stat]) => ({
    bucket,
    count: stat.count,
    amountMinorUnits: stat.amount,
    amountFormatted: formatINR(stat.amount),
  }));

  // Broken promises dedicated list
  const brokenPromisesList = promises
    .filter((p) => p.status === 'broken')
    .map((p) => {
      const cust = customerMap.get(p.customer_id);
      const inv = p.invoice_id ? invoices.find((i) => i.id === p.invoice_id) : null;
      const daysSince = calculateAgeDays(p.expected_date, today);
      const outstanding = inv ? getInvoiceOutstandingBalance(inv) : p.promised_amount_minor_units;

      return {
        promiseId: p.id,
        customerName: cust ? cust.name : 'Unknown Customer',
        invoiceNumber: inv ? inv.number : 'N/A',
        promisedAmountFormatted: formatINR(p.promised_amount_minor_units),
        expectedDate: p.expected_date,
        daysSincePromise: daysSince,
        outstandingFormatted: formatINR(outstanding),
        nextAction: 'Follow up on broken payment promise',
      };
    });

  // Apply filters
  let filtered = [...items];

  if (filters.priority && filters.priority !== 'all') {
    filtered = filtered.filter((i) => i.priority === filters.priority);
  }

  if (filters.risk && filters.risk !== 'all') {
    filtered = filtered.filter((i) => i.riskBand === filters.risk);
  }

  if (filters.promiseStatus && filters.promiseStatus !== 'all') {
    filtered = filtered.filter((i) => i.promiseStatus === filters.promiseStatus);
  }

  if (filters.hasBlocker && filters.hasBlocker !== 'all') {
    filtered = filtered.filter((i) => (filters.hasBlocker === 'yes' ? i.hasBlocker : !i.hasBlocker));
  }

  if (filters.customerId) {
    filtered = filtered.filter((i) => i.customerId === filters.customerId);
  }

  if (filters.ownerId) {
    if (filters.ownerId === 'unassigned') {
      filtered = filtered.filter((i) => !i.ownerId);
    } else {
      filtered = filtered.filter((i) => i.ownerId === filters.ownerId);
    }
  }

  if (filters.minAmount !== undefined) {
    filtered = filtered.filter((i) => i.outstandingMinorUnits >= filters.minAmount! * 100);
  }

  if (filters.maxAmount !== undefined) {
    filtered = filtered.filter((i) => i.outstandingMinorUnits <= filters.maxAmount! * 100);
  }

  if (filters.minAgeDays !== undefined) {
    filtered = filtered.filter((i) => i.daysOverdue >= filters.minAgeDays!);
  }

  if (filters.maxAgeDays !== undefined) {
    filtered = filtered.filter((i) => i.daysOverdue <= filters.maxAgeDays!);
  }

  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter((i) =>
      i.customerName.toLowerCase().includes(q) ||
      i.invoiceNumber.toLowerCase().includes(q) ||
      i.nextBestAction.toLowerCase().includes(q) ||
      i.priorityReason.toLowerCase().includes(q)
    );
  }

  // Sorting
  const sortBy = filters.sortBy || 'priority';
  const sortOrder = filters.sortOrder || 'desc';

  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'priority') {
      const pRank = { critical: 4, high: 3, medium: 2, low: 1 };
      cmp = pRank[a.priority] - pRank[b.priority];
    } else if (sortBy === 'amount') {
      cmp = a.outstandingMinorUnits - b.outstandingMinorUnits;
    } else if (sortBy === 'age') {
      cmp = a.daysOverdue - b.daysOverdue;
    } else if (sortBy === 'risk') {
      const rRank = { high: 3, medium: 2, low: 1 };
      cmp = rRank[a.riskBand] - rRank[b.riskBand];
    }

    return sortOrder === 'desc' ? -cmp : cmp;
  });

  // Default deterministic ordering if no specific sort specified: Critical -> Broken Promise -> Highest Outstanding -> Oldest
  if (!filters.sortBy) {
    filtered.sort((a, b) => {
      const pRank = { critical: 4, high: 3, medium: 2, low: 1 };
      if (pRank[a.priority] !== pRank[b.priority]) {
        return pRank[b.priority] - pRank[a.priority];
      }
      if (a.outstandingMinorUnits !== b.outstandingMinorUnits) {
        return b.outstandingMinorUnits - a.outstandingMinorUnits;
      }
      return b.daysOverdue - a.daysOverdue;
    });
  }

  // Pagination
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize || 20));
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

  return {
    items: paginatedItems,
    totalCount,
    page,
    pageSize,
    totalPages,
    kpis: {
      totalOverdueMinorUnits: totalOverdueSum,
      totalOverdueFormatted: formatINR(totalOverdueSum),
      dueTodayCount,
      highPriorityCount,
      promisesDueCount,
      brokenPromisesCount,
      unassignedCount,
      actionableMinorUnits: actionableSum,
      actionableFormatted: formatINR(actionableSum),
      recoveredCashMinorUnits: paidMatchedSum,
      recoveredCashFormatted: formatINR(paidMatchedSum),
    },
    aging,
    brokenPromisesList,
  };
}