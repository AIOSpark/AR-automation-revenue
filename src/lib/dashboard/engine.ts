// AIOSpark Core Dashboard Metrics Calculation Engine (Layer 9)

import { udmStore } from '../udm/store';
import { Invoice } from '../udm/types';
import { getRequestTenant } from '../tenant/request-context';

export interface DashboardMetricsResult {
  organizationId: string;
  totalReceivablesMinorUnits: number;
  overdueMinorUnits: number;
  atRiskMinorUnits: number;
  cashUnblockedOpportunityMinorUnits: number;
  computedAt: string;
}

/** Helper to compute true outstanding balance for an invoice
 * Formula: Outstanding = Gross Invoice Amount - Matched Payments - Active Credit Allocations
 * Derives orgId from the active AsyncLocalStorage request context.
 */
export function getInvoiceOutstandingBalance(invoice: Invoice): number {
  const orgId = getRequestTenant();
  if (!orgId) {
    throw new Error('Missing tenant context: orgId not available in current request context');
  }
  const matches = udmStore.getMatches().filter((m) => m.invoice_id === invoice.id && m.organization_id === orgId);
  const paidMatchedSum = matches.reduce((acc, m) => acc + m.matched_amount_minor_units, 0);
  const allocations = udmStore.getCreditAllocations().filter(
    (a) => a.invoice_id === invoice.id && a.status === 'allocated' && a.organization_id === orgId,
  );
  const creditAllocatedSum = allocations.reduce((acc, a) => acc + a.allocated_amount_minor_units, 0);
  const outstanding = invoice.amount_minor_units - paidMatchedSum - creditAllocatedSum;
  return Math.max(0, outstanding);
}

/** Settlement breakdown for an invoice
 * Returns gross amount, paid matched amount, credit allocated amount, and net outstanding.
 */
export function getInvoiceSettlementBreakdown(invoice: Invoice): {
  grossAmountMinorUnits: number;
  paidMatchedMinorUnits: number;
  creditAllocatedMinorUnits: number;
  outstandingMinorUnits: number;
  isFullySettled: boolean;
} {
  const orgId = getRequestTenant();
  if (!orgId) {
    throw new Error('Missing tenant context: orgId not available in current request context');
  }
  const matches = udmStore.getMatches().filter((m) => m.invoice_id === invoice.id && m.organization_id === orgId);
  const paidMatchedSum = matches.reduce((acc, m) => acc + m.matched_amount_minor_units, 0);

  const creditAllocs = udmStore.getCreditAllocations().filter(
    (a) => a.invoice_id === invoice.id && a.status === 'allocated' && a.organization_id === orgId,
  );
  const creditAllocatedSum = creditAllocs.reduce((acc, a: any) => acc + a.allocated_amount_minor_units, 0);

  const outstanding = invoice.amount_minor_units - paidMatchedSum - creditAllocatedSum;
  return {
    grossAmountMinorUnits: invoice.amount_minor_units,
    paidMatchedMinorUnits: paidMatchedSum,
    creditAllocatedMinorUnits: creditAllocatedSum,
    outstandingMinorUnits: Math.max(0, outstanding),
    isFullySettled: Math.max(0, outstanding) === 0,
  };
}

/** Metric 1: Total Receivables
 * Sum of outstanding balance across all invoices with status in ('open', 'partially_paid', 'disputed').
 */
export function computeTotalReceivables(invoices: Invoice[], orgId: string): number {
  const eligibleStatuses = new Set(['open', 'partially_paid', 'disputed']);
  return invoices
    .filter((inv) => eligibleStatuses.has(inv.status))
    .reduce((sum, inv) => sum + getInvoiceOutstandingBalance(inv), 0);
}

/** Metric 2: Overdue
 * Sum of outstanding balance for eligible invoices where due_date < today.
 */
export function computeOverdueReceivables(invoices: Invoice[], orgId: string, todayStr?: string): number {
  const today = todayStr || new Date().toISOString().split('T')[0];
  const eligibleStatuses = new Set(['open', 'partially_paid', 'disputed']);

  return invoices
    .filter((inv) => eligibleStatuses.has(inv.status) && inv.due_date < today)
    .reduce((sum, inv) => sum + getInvoiceOutstandingBalance(inv), 0);
}

import { computeCustomerFinancialProfile } from '../customer/risk-engine';

/** Metric 3: At Risk (Layer 12 Rule-Based Risk Alignment)
 * Formula: Outstanding balance for non-overdue invoices due within next 14 days
 * belonging to customers classified as 'high' or 'medium' risk by Layer 12's Customer Risk Engine.
 */
export function computeAtRiskReceivables(invoices: Invoice[], orgId: string, todayStr?: string): number {
  const today = todayStr || new Date().toISOString().split('T')[0];
  const todayMs = new Date(today).getTime();
  const fourteenDaysMs = todayMs + 14 * 24 * 60 * 60 * 1000;
  const fourteenDaysStr = new Date(fourteenDaysMs).toISOString().split('T')[0];

  const eligibleStatuses = new Set(['open', 'partially_paid']);
  const riskCache = new Map<string, 'high' | 'medium' | 'low'>();

  return invoices
    .filter((inv) => {
      if (!eligibleStatuses.has(inv.status)) return false;
      if (inv.due_date < today || inv.due_date > fourteenDaysStr) return false;

      if (!riskCache.has(inv.customer_id)) {
        const profile = computeCustomerFinancialProfile(inv.customer_id, orgId, todayStr);
        riskCache.set(inv.customer_id, profile.riskBand);
      }

      const riskBand = riskCache.get(inv.customer_id);
      return riskBand === 'high' || riskBand === 'medium';
    })
    .reduce((sum, inv) => sum + getInvoiceOutstandingBalance(inv), 0);
}

/** Metric 4: Cash Unblocked Opportunity (Single Shared Definition per Layer 22)
 * REAL DEFINITION: Sum of outstanding balance across open Exceptions with status in
 * ('classified', 'severity_determined', 'owner_assigned', 'recommended', 'pending_approval', 'approved')
 * that have a non-UNKNOWN category and a clear recommended_action.
 */
export function computeCashUnblockedOpportunity(invoices: Invoice[], orgId: string, todayStr?: string): number {
  const activeOrgId = getRequestTenant();
  if (!activeOrgId) {
    throw new Error('Missing tenant context: orgId not available in current request context');
  }
  const exceptions = udmStore.getExceptions();
  const validStatuses = new Set([
    'classified',
    'severity_determined',
    'owner_assigned',
    'recommended',
    'pending_approval',
    'approved',
  ]);

  const actionableInvoiceIds = new Set<string>();
  for (const ex of exceptions) {
    if (
      ex.invoice_id &&
      validStatuses.has(ex.status) &&
      ex.type !== 'UNKNOWN' &&
      ex.recommended_action &&
      ex.recommended_action.trim().length > 0
    ) {
      actionableInvoiceIds.add(ex.invoice_id);
    }
  }

  return invoices
    .filter((inv) => actionableInvoiceIds.has(inv.id) && inv.status !== 'paid' && inv.status !== 'written_off')
    .reduce((sum, inv) => sum + getInvoiceOutstandingBalance(inv), 0);
}

class DashboardMetricsStore {
  private cache: Map<string, DashboardMetricsResult> = new Map();

  public refreshMetrics(orgId: string, todayStr?: string): DashboardMetricsResult {
    const activeOrgId = getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const invoices = udmStore.getInvoices();

    const totalReceivables = computeTotalReceivables(invoices, activeOrgId);
    const overdue = computeOverdueReceivables(invoices, activeOrgId, todayStr);
    const atRisk = computeAtRiskReceivables(invoices, activeOrgId, todayStr);
    const cashUnblocked = computeCashUnblockedOpportunity(invoices, activeOrgId, todayStr);

    const now = new Date().toISOString();
    const result: DashboardMetricsResult = {
      organizationId: activeOrgId,
      totalReceivablesMinorUnits: totalReceivables,
      overdueMinorUnits: overdue,
      atRiskMinorUnits: atRisk,
      cashUnblockedOpportunityMinorUnits: cashUnblocked,
      computedAt: now,
    };

    this.cache.set(orgId, result);
    return result;
  }

  public getCachedMetrics(orgId: string): DashboardMetricsResult {
    const cached = this.cache.get(orgId);
    if (cached) return cached;
    return this.refreshMetrics(orgId);
  }

  public clearAll(): void {
    this.cache.clear();
  }

  /** Invalidate cached metrics for an org (or all orgs) when underlying data mutates. */
  public clearCache(orgId?: string): void {
    if (orgId) {
      this.cache.delete(orgId);
    } else {
      this.cache.clear();
    }
  }
}

export const dashboardMetricsStore = new DashboardMetricsStore();

// Register cache invalidation on any UDM data mutation so dashboard metrics
// are never served stale after invoice/payment/exception/bank-transaction changes.
udmStore.registerDataChangeHandler((orgId) => dashboardMetricsStore.clearCache(orgId));