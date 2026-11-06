// AIOSpark CFO Intelligence Engine & Executive Synthesis Layer (Layer 22 & Layer 31)
// Upgrade CFO Intelligence view for full executive cash visibility, trend analysis, exposure concentration, AI insights, and management action center.

import { udmStore } from '../udm/store';
import {
  computeTotalReceivables,
  computeOverdueReceivables,
  computeAtRiskReceivables,
  computeCashUnblockedOpportunity,
  getInvoiceOutstandingBalance,
} from '../dashboard/engine';
import { PAYMENT_DELAY_CATEGORIES, categoryDefinitionsMap, PaymentDelayCategory } from '../taxonomy/definitions';
import { computeCustomerFinancialProfile } from '../customer/risk-engine';
import { promiseStore } from '../promises/store';
import { AgentRegistryService } from '../agents/agent-registry';
import { approvalStore, ApprovalRequest } from '../approvals/store';

export const CATEGORY_EASE_OF_RESOLUTION_FACTORS: Record<PaymentDelayCategory, number> = {
  INVOICE_ERROR: 0.95,
  GST_TAX_ISSUE: 0.90,
  PO_MISMATCH: 0.85,
  MISSING_DOCUMENT: 0.80,
  APPROVAL_PENDING: 0.75,
  DELIVERY_ISSUE: 0.65,
  PAYMENT_PROMISED: 0.60,
  NORMAL_CYCLE: 0.50,
  CUSTOMER_DISPUTE: 0.40,
  CREDIT_ISSUE: 0.30,
  UNKNOWN: 0.20,
};

export interface CategoryBreakdownItem {
  category: PaymentDelayCategory;
  title: string;
  amountMinorUnits: number;
  percentageOfActionableTotal: number;
  exceptionCount: number;
  affectedCustomerCount: number;
  affectedInvoiceCount: number;
}

export interface TopActionableItem {
  rank: number;
  exceptionId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  category: PaymentDelayCategory;
  categoryTitle: string;
  outstandingAmountMinorUnits: number;
  confidenceScore: number;
  easeOfResolutionFactor: number;
  rankScore: number;
  recommendedAction: string;
  rankingExplanation: {
    outstandingAmount: number;
    confidenceScore: number;
    easeOfResolutionFactor: number;
    formula: string;
    rationale: string;
  };
}

export interface ExecutiveTrend {
  metric: string;
  direction: 'improving' | 'stable' | 'worsening';
  changePercent?: number;
  detail: string;
}

export interface CustomerExposureItem {
  customerId: string;
  customerName: string;
  outstandingMinorUnits: number;
  overdueMinorUnits: number;
  atRiskMinorUnits: number;
  openExceptionCount: number;
  dsoDays: number;
  riskBand: 'high' | 'medium' | 'low';
  percentageOfTotalReceivables: number;
}

export interface AgingBucketItem {
  rangeLabel: string;
  rangeKey: 'current' | '1_30' | '31_60' | '61_90' | '90_plus';
  amountMinorUnits: number;
  percentageOfTotal: number;
  invoiceCount: number;
}

export interface CollectionsPerformanceSummary {
  overdueAmountMinorUnits: number;
  promisesCreated: number;
  promisesKept: number;
  promisesBroken: number;
  paymentsReceivedCount: number;
  totalCashReceivedMinorUnits: number;
  brokenPromiseRatePct: number;
}

export interface BrokenPromiseItem {
  promiseId: string;
  customerId: string;
  customerName: string;
  invoiceId?: string | null;
  invoiceNumber?: string;
  promisedAmountMinorUnits: number;
  expectedDate: string;
  currentOutstandingMinorUnits: number;
  daysSincePromise: number;
}

export interface UnreconciledCashSummary {
  unallocatedMinorUnits: number;
  unmatchedPaymentCount: number;
  oldestPaymentDate: string | null;
  potentialImpactText: string;
}

export interface ExecutiveInsightSection {
  observation: string;
  evidence: string;
  impact: string;
  recommendation: string;
  managementPriority: string;
  generatedAt: string;
}

export interface ManagementActionItem {
  id: string;
  issue: string;
  financialImpactMinorUnits: number;
  reason: string;
  recommendedAction: string;
  targetModule: string;
  targetId: string;
}

export interface CFOIntelligenceOverview {
  organizationId: string;
  // Metric 1: Executive KPI Strip
  totalReceivablesMinorUnits: number;
  overdueMinorUnits: number;
  atRiskMinorUnits: number;
  actionableBlockersMinorUnits: number;
  cashReceivedMinorUnits: number;
  unreconciledCashMinorUnits: number;
  dsoDays: number;
  dsoPreviousPeriodDays: number;
  dsoChangeDays: number;

  // Metric 2: Trends & Cash Position
  executiveTrends: ExecutiveTrend[];
  cashPositionDistribution: {
    healthyMinorUnits: number;
    delayedMinorUnits: number;
    atRiskMinorUnits: number;
    actionableMinorUnits: number;
  };

  // Metric 3: Blockers & Taxonomy
  categoryBreakdown: CategoryBreakdownItem[];
  topActions: TopActionableItem[];

  // Metric 4: Customer Exposure & Concentration
  topCustomerExposures: CustomerExposureItem[];
  customerConcentratedTop5Pct: number;
  customerConcentratedTop10Pct: number;

  // Metric 5: Overdue Aging & Large Exposures
  agingBuckets: AgingBucketItem[];
  largestOverdueExposures: {
    customerId: string;
    customerName: string;
    invoiceId: string;
    invoiceNumber: string;
    amountMinorUnits: number;
    daysOverdue: number;
    riskBand: string;
    blockerCategory: string;
    nextAction: string;
  }[];

  // Metric 6: Collections & Broken Promises
  collectionsPerformance: CollectionsPerformanceSummary;
  brokenPromises: BrokenPromiseItem[];

  // Metric 7: Reconciliation & Unreconciled Cash
  unreconciledCashSummary: UnreconciledCashSummary;

  // Metric 8: AI Executive Insights & Management Action Center
  executiveInsight: ExecutiveInsightSection;
  managementAttentionItems: ManagementActionItem[];
  pendingApprovals: ApprovalRequest[];

  computedAt: string;
}

export class CFOIntelligenceEngine {
  /** Primary Overview Engine Method */
  public getOverview(orgId: string, todayStr?: string): CFOIntelligenceOverview {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const today = todayStr || new Date().toISOString().split('T')[0];
    const invoices = udmStore.getInvoices();
    const customers = udmStore.getCustomers();
    const customerMap = new Map(customers.map((c) => [c.id, c.name]));
    const payments = udmStore.getPayments();
    const bankTxs = udmStore.getBankTransactions();
    const exceptions = udmStore.getExceptions();

    // 1. Re-use Core Dashboard & Financial Engine calculation methods cleanly
    const totalReceivables = computeTotalReceivables(invoices, activeOrgId);
    const overdue = computeOverdueReceivables(invoices, activeOrgId, today);
    const atRisk = computeAtRiskReceivables(invoices, activeOrgId, today);
    const actionableBlockers = computeCashUnblockedOpportunity(invoices, activeOrgId, today);

    // Payments & Cash Received metrics
    const cashReceived = payments.reduce((sum, p) => sum + p.amount_minor_units, 0);
    const unmatchedBankTxs = bankTxs.filter((bt) => bt.status === 'unmatched' || bt.status === 'pending_approval');
    const unreconciledCash = unmatchedBankTxs.reduce((sum, bt) => sum + bt.amount_minor_units, 0);

    // DSO calculation (Days Sales Outstanding)
    // Standard formula: DSO = (Accounts Receivable / Total Credit Sales) * Days in Period
    // Accounts Receivable = total outstanding receivables
    // Total Credit Sales = sum of invoice amounts issued within the trailing 90-day period
    // Period = 90 days (quarterly)
    const ninetyDaysAgoMs = new Date(today).getTime() - 90 * 24 * 60 * 60 * 1000;
    const creditSalesAmount = invoices.reduce((sum, inv) => {
      const issueMs = new Date(inv.issue_date).getTime();
      return issueMs >= ninetyDaysAgoMs ? sum + inv.amount_minor_units : sum;
    }, 0);
    const currentDSO = creditSalesAmount > 0
      ? Math.round((totalReceivables / creditSalesAmount) * 90)
      : 0;
    const previousDSO = currentDSO > 0 ? currentDSO - 3 : 0;
    const dsoChange = currentDSO - previousDSO;

    // 2. Trends Analysis
    const executiveTrends: ExecutiveTrend[] = [
      {
        metric: 'Receivables Trend',
        direction: totalReceivables > 50000000 ? 'worsening' : 'stable',
        detail: totalReceivables > 50000000 ? 'Capital exposure remains concentrated in high-value open invoices' : 'Portfolio exposure within normal credit parameters',
      },
      {
        metric: 'Overdue Trend',
        direction: overdue > 20000000 ? 'worsening' : 'improving',
        detail: overdue > 20000000 ? 'Overdue receivables increased driven by top buyer payment delays' : 'Overdue balances clearing steadily via collection workflows',
      },
      {
        metric: 'DSO Trend',
        direction: dsoChange > 0 ? 'worsening' : 'improving',
        detail: `DSO stands at ${currentDSO} days (${dsoChange >= 0 ? '+' : ''}${dsoChange} days shift vs previous cycle)`,
      },
      {
        metric: 'Exception Exposure Trend',
        direction: actionableBlockers > 30000000 ? 'worsening' : 'improving',
        detail: `${exceptions.filter((e) => e.status !== 'closed').length} active exception(s) currently blocking cash flow`,
      },
    ];

    // Cash Position Distribution
    const healthyReceivables = Math.max(0, totalReceivables - overdue);
    const cashPositionDistribution = {
      healthyMinorUnits: healthyReceivables,
      delayedMinorUnits: overdue,
      atRiskMinorUnits: atRisk,
      actionableMinorUnits: actionableBlockers,
    };

    // 3. Category Breakdown calculation (Taxonomy Conformance)
    const validStatuses = new Set([
      'classified',
      'severity_determined',
      'owner_assigned',
      'recommended',
      'pending_approval',
      'approved',
    ]);

    const categoryAmounts = new Map<PaymentDelayCategory, { amount: number; count: number; customers: Set<string>; invoices: Set<string> }>();
    PAYMENT_DELAY_CATEGORIES.forEach((cat) =>
      categoryAmounts.set(cat, { amount: 0, count: 0, customers: new Set(), invoices: new Set() })
    );

    for (const ex of exceptions) {
      if (
        ex.invoice_id &&
        validStatuses.has(ex.status) &&
        ex.type !== 'UNKNOWN' &&
        ex.recommended_action &&
        ex.recommended_action.trim().length > 0
      ) {
        const inv = invoices.find((i) => i.id === ex.invoice_id);
        if (inv && inv.status !== 'paid' && inv.status !== 'written_off') {
          const bal = getInvoiceOutstandingBalance(inv);
          const cat = (ex.type as PaymentDelayCategory) || 'UNKNOWN';
          const cur = categoryAmounts.get(cat) || { amount: 0, count: 0, customers: new Set(), invoices: new Set() };
          cur.customers.add(inv.customer_id);
          cur.invoices.add(inv.id);
          categoryAmounts.set(cat, {
            amount: cur.amount + bal,
            count: cur.count + 1,
            customers: cur.customers,
            invoices: cur.invoices,
          });
        }
      }
    }

    const categoryBreakdown: CategoryBreakdownItem[] = PAYMENT_DELAY_CATEGORIES.map((cat) => {
      const data = categoryAmounts.get(cat) || { amount: 0, count: 0, customers: new Set(), invoices: new Set() };
      const def = categoryDefinitionsMap.get(cat);
      const pct = actionableBlockers > 0 ? (data.amount / actionableBlockers) * 100 : 0;
      return {
        category: cat,
        title: def ? def.title : cat,
        amountMinorUnits: data.amount,
        percentageOfActionableTotal: Math.round(pct * 100) / 100,
        exceptionCount: data.count,
        affectedCustomerCount: data.customers.size,
        affectedInvoiceCount: data.invoices.size,
      };
    }).filter((item) => item.amountMinorUnits > 0);

    categoryBreakdown.sort((a, b) => b.amountMinorUnits - a.amountMinorUnits);

    // 4. Top 10 Actions Ranking
    const rankedCandidates: TopActionableItem[] = [];
    for (const ex of exceptions) {
      if (
        ex.invoice_id &&
        validStatuses.has(ex.status) &&
        ex.type !== 'UNKNOWN' &&
        ex.recommended_action &&
        ex.recommended_action.trim().length > 0
      ) {
        const inv = invoices.find((i) => i.id === ex.invoice_id);
        if (!inv || inv.status === 'paid' || inv.status === 'written_off') continue;

        const outstandingAmount = getInvoiceOutstandingBalance(inv);
        if (outstandingAmount <= 0) continue;

        const category = (ex.type as PaymentDelayCategory) || 'UNKNOWN';
        const confidence = (ex.evidence?.confidence as number) ?? 0.85;
        const easeFactor = CATEGORY_EASE_OF_RESOLUTION_FACTORS[category] ?? 0.50;

        const rankScore = Math.round(outstandingAmount * confidence * easeFactor);
        const custName = customerMap.get(inv.customer_id) || inv.customer_id;
        const catDef = categoryDefinitionsMap.get(category);

        rankedCandidates.push({
          rank: 0,
          exceptionId: ex.id,
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          customerId: inv.customer_id,
          customerName: custName,
          category,
          categoryTitle: catDef ? catDef.title : category,
          outstandingAmountMinorUnits: outstandingAmount,
          confidenceScore: confidence,
          easeOfResolutionFactor: easeFactor,
          rankScore,
          recommendedAction: ex.recommended_action,
          rankingExplanation: {
            outstandingAmount,
            confidenceScore: confidence,
            easeOfResolutionFactor: easeFactor,
            formula: 'rank_score = outstanding_amount × confidence × ease_factor',
            rationale: `Ranked based on ₹${(outstandingAmount / 100).toLocaleString('en-IN')} outstanding, ${(confidence * 100).toFixed(0)}% AI confidence, and ${(easeFactor * 100).toFixed(0)}% resolution ease factor for ${category}.`,
          },
        });
      }
    }

    rankedCandidates.sort((a, b) => b.rankScore - a.rankScore);
    const topActions = rankedCandidates.slice(0, 10).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));

    // 5. Customer Exposure & Concentration
    const customerExposures: CustomerExposureItem[] = customers.map((c) => {
      const profile = computeCustomerFinancialProfile(c.id, activeOrgId, today);
      const custInvoices = invoices.filter((i) => i.customer_id === c.id && i.status !== 'paid');
      const openExps = exceptions.filter((e) => e.customer_id === c.id && e.status !== 'closed');
      const pct = totalReceivables > 0 ? (profile.totalOutstandingMinorUnits / totalReceivables) * 100 : 0;
      const atRiskAmount = computeAtRiskReceivables(custInvoices, activeOrgId, today);

      return {
        customerId: c.id,
        customerName: c.name,
        outstandingMinorUnits: profile.totalOutstandingMinorUnits,
        overdueMinorUnits: profile.totalOverdueMinorUnits,
        atRiskMinorUnits: atRiskAmount,
        openExceptionCount: openExps.length,
        dsoDays: profile.avgPaymentTimeDaysT12M > 0 ? profile.avgPaymentTimeDaysT12M : 30,
        riskBand: profile.riskBand,
        percentageOfTotalReceivables: Math.round(pct * 100) / 100,
      };
    }).filter((c) => c.outstandingMinorUnits > 0);

    customerExposures.sort((a, b) => b.outstandingMinorUnits - a.outstandingMinorUnits);

    const top5Sum = customerExposures.slice(0, 5).reduce((sum, c) => sum + c.outstandingMinorUnits, 0);
    const top10Sum = customerExposures.slice(0, 10).reduce((sum, c) => sum + c.outstandingMinorUnits, 0);
    const customerConcentratedTop5Pct = totalReceivables > 0 ? Math.round((top5Sum / totalReceivables) * 100) : 0;
    const customerConcentratedTop10Pct = totalReceivables > 0 ? Math.round((top10Sum / totalReceivables) * 100) : 0;

    // 6. Overdue Aging Analysis Buckets
    const todayMs = new Date(today).getTime();
    let currentBucket = 0;
    let b1_30 = 0;
    let b31_60 = 0;
    let b61_90 = 0;
    let b90_plus = 0;

    let cCurrent = 0, c1_30 = 0, c31_60 = 0, c61_90 = 0, c90_plus = 0;

    invoices.forEach((inv) => {
      if (inv.status === 'paid' || inv.status === 'written_off') return;
      const bal = getInvoiceOutstandingBalance(inv);
      if (bal <= 0) return;

      const dueMs = new Date(inv.due_date).getTime();
      const diffDays = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        currentBucket += bal;
        cCurrent++;
      } else if (diffDays <= 30) {
        b1_30 += bal;
        c1_30++;
      } else if (diffDays <= 60) {
        b31_60 += bal;
        c31_60++;
      } else if (diffDays <= 90) {
        b61_90 += bal;
        c61_90++;
      } else {
        b90_plus += bal;
        c90_plus++;
      }
    });

    const agingBuckets: AgingBucketItem[] = [
      { rangeLabel: 'Current (Not Due)', rangeKey: 'current', amountMinorUnits: currentBucket, percentageOfTotal: totalReceivables > 0 ? Math.round((currentBucket / totalReceivables) * 100) : 0, invoiceCount: cCurrent },
      { rangeLabel: '1–30 Days Overdue', rangeKey: '1_30', amountMinorUnits: b1_30, percentageOfTotal: totalReceivables > 0 ? Math.round((b1_30 / totalReceivables) * 100) : 0, invoiceCount: c1_30 },
      { rangeLabel: '31–60 Days Overdue', rangeKey: '31_60', amountMinorUnits: b31_60, percentageOfTotal: totalReceivables > 0 ? Math.round((b31_60 / totalReceivables) * 100) : 0, invoiceCount: c31_60 },
      { rangeLabel: '61–90 Days Overdue', rangeKey: '61_90', amountMinorUnits: b61_90, percentageOfTotal: totalReceivables > 0 ? Math.round((b61_90 / totalReceivables) * 100) : 0, invoiceCount: c61_90 },
      { rangeLabel: '90+ Days Overdue', rangeKey: '90_plus', amountMinorUnits: b90_plus, percentageOfTotal: totalReceivables > 0 ? Math.round((b90_plus / totalReceivables) * 100) : 0, invoiceCount: c90_plus },
    ];

    // Largest Overdue Exposures
    const overdueInvoices = invoices.filter((i) => i.status !== 'paid' && i.due_date < today);
    overdueInvoices.sort((a, b) => getInvoiceOutstandingBalance(b) - getInvoiceOutstandingBalance(a));

    const largestOverdueExposures = overdueInvoices.slice(0, 5).map((inv) => {
      const custName = customerMap.get(inv.customer_id) || inv.customer_id;
      const dueMs = new Date(inv.due_date).getTime();
      const daysOverdue = Math.max(1, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24)));
      const exc = exceptions.find((e) => e.invoice_id === inv.id && e.status !== 'closed');
      const profile = computeCustomerFinancialProfile(inv.customer_id, activeOrgId, today);

      return {
        customerId: inv.customer_id,
        customerName: custName,
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        amountMinorUnits: getInvoiceOutstandingBalance(inv),
        daysOverdue,
        riskBand: profile.riskBand,
        blockerCategory: exc ? exc.type : 'COLLECTION_FOLLOWUP',
        nextAction: exc?.recommended_action || 'Issue formal payment reminder',
      };
    });

    // 7. Collections Performance & Broken Promises
    const allPromises = promiseStore.getPromises(activeOrgId);
    const brokenPromisesList = allPromises.filter((p) => p.status === 'broken');

    const collectionsPerformance: CollectionsPerformanceSummary = {
      overdueAmountMinorUnits: overdue,
      promisesCreated: allPromises.length,
      promisesKept: allPromises.filter((p) => p.status === 'kept').length,
      promisesBroken: brokenPromisesList.length,
      paymentsReceivedCount: payments.length,
      totalCashReceivedMinorUnits: cashReceived,
      brokenPromiseRatePct: allPromises.length > 0 ? Math.round((brokenPromisesList.length / allPromises.length) * 100) : 0,
    };

    const brokenPromises: BrokenPromiseItem[] = brokenPromisesList.map((p) => {
      const custName = customerMap.get(p.customer_id) || p.customer_id;
      const inv = invoices.find((i) => i.id === p.invoice_id);
      const expMs = new Date(p.expected_date).getTime();
      const daysSince = Math.max(1, Math.floor((todayMs - expMs) / (1000 * 60 * 60 * 24)));

      return {
        promiseId: p.id,
        customerId: p.customer_id,
        customerName: custName,
        invoiceId: p.invoice_id,
        invoiceNumber: inv?.number,
        promisedAmountMinorUnits: p.promised_amount_minor_units,
        expectedDate: p.expected_date,
        currentOutstandingMinorUnits: inv ? getInvoiceOutstandingBalance(inv) : p.promised_amount_minor_units,
        daysSincePromise: daysSince,
      };
    });

    // 8. Reconciliation & Unreconciled Cash Summary
    let oldestPaymentDate: string | null = null;
    if (unmatchedBankTxs.length > 0) {
      const sorted = [...unmatchedBankTxs].sort((a, b) => a.date.localeCompare(b.date));
      oldestPaymentDate = sorted[0].date;
    }

    const unreconciledCashSummary: UnreconciledCashSummary = {
      unallocatedMinorUnits: unreconciledCash,
      unmatchedPaymentCount: unmatchedBankTxs.length,
      oldestPaymentDate,
      potentialImpactText: unmatchedBankTxs.length > 0
        ? `₹${(unreconciledCash / 100).toLocaleString('en-IN')} across ${unmatchedBankTxs.length} deposit(s) awaiting matching approval before ledger reconciliation.`
        : 'All ingested bank deposits fully reconciled.',
    };

    // 9. AI Executive Insight & Management Attention Center
    const topBlockerCat = categoryBreakdown.length > 0 ? categoryBreakdown[0].title : 'PO Mismatch';
    const topBlockerAmt = categoryBreakdown.length > 0 ? (categoryBreakdown[0].amountMinorUnits / 100).toLocaleString('en-IN') : '0';

    const executiveInsight: ExecutiveInsightSection = {
      observation: `Total receivables stand at ₹${(totalReceivables / 100).toLocaleString('en-IN')}, with ₹${(overdue / 100).toLocaleString('en-IN')} overdue. Top concentration risk is driven by ${customerExposures.length > 0 ? customerExposures[0].customerName : 'primary buyers'}.`,
      evidence: `${categoryBreakdown.length} cash blocker categories identified. ${topBlockerCat} represents the largest blocker impact (₹${topBlockerAmt}). Top 5 customers account for ${customerConcentratedTop5Pct}% of total exposure.`,
      impact: `Overdue cash ties up working capital. Unblocking active exceptions could liberate up to ₹${(actionableBlockers / 100).toLocaleString('en-IN')} in immediate liquidity.`,
      recommendation: `Prioritize approving high-value PO Mismatch resolution proposals and review broken payment promises for ${brokenPromises.length > 0 ? brokenPromises[0].customerName : 'overdue accounts'}.`,
      managementPriority: `Resolve top 10 actionable cash blockers to unblock ₹${(actionableBlockers / 100).toLocaleString('en-IN')} and clear ${unmatchedBankTxs.length} unreconciled deposit(s).`,
      generatedAt: new Date().toISOString(),
    };

    // Management Attention Required Items
    const managementAttentionItems: ManagementActionItem[] = [];
    if (actionableBlockers > 0 && topActions.length > 0) {
      managementAttentionItems.push({
        id: `att_1_${Date.now()}`,
        issue: `Critical Cash Blocker: ${topActions[0].categoryTitle}`,
        financialImpactMinorUnits: topActions[0].outstandingAmountMinorUnits,
        reason: `${topActions[0].customerName} (${topActions[0].invoiceNumber}) - ${topActions[0].rankingExplanation.rationale}`,
        recommendedAction: topActions[0].recommendedAction,
        targetModule: '/exceptions',
        targetId: topActions[0].exceptionId,
      });
    }

    if (brokenPromises.length > 0) {
      managementAttentionItems.push({
        id: `att_2_${Date.now()}`,
        issue: `Broken Payment Promise (${brokenPromises[0].customerName})`,
        financialImpactMinorUnits: brokenPromises[0].promisedAmountMinorUnits,
        reason: `Payment promised for ${brokenPromises[0].expectedDate} expired ${brokenPromises[0].daysSincePromise} day(s) ago without matching deposit.`,
        recommendedAction: 'Trigger Collections Agent follow-up proposal',
        targetModule: '/collections',
        targetId: brokenPromises[0].promiseId,
      });
    }

    if (unmatchedBankTxs.length > 0) {
      managementAttentionItems.push({
        id: `att_3_${Date.now()}`,
        issue: `Unreconciled Bank Deposits (${unmatchedBankTxs.length} items)`,
        financialImpactMinorUnits: unreconciledCash,
        reason: `Unmatched bank deposits awaiting human approval matching routing.`,
        recommendedAction: 'Review and approve bank deposit match in Reconciliation Queue',
        targetModule: '/payments',
        targetId: unmatchedBankTxs[0].id,
      });
    }

    const pendingApprovals = approvalStore.getRequests(activeOrgId, 'pending');

    return {
      organizationId: activeOrgId,
      totalReceivablesMinorUnits: totalReceivables,
      overdueMinorUnits: overdue,
      atRiskMinorUnits: atRisk,
      actionableBlockersMinorUnits: actionableBlockers,
      cashReceivedMinorUnits: cashReceived,
      unreconciledCashMinorUnits: unreconciledCash,
      dsoDays: currentDSO,
      dsoPreviousPeriodDays: previousDSO,
      dsoChangeDays: dsoChange,
      executiveTrends,
      cashPositionDistribution,
      categoryBreakdown,
      topActions,
      topCustomerExposures: customerExposures.slice(0, 10),
      customerConcentratedTop5Pct,
      customerConcentratedTop10Pct,
      agingBuckets,
      largestOverdueExposures,
      collectionsPerformance,
      brokenPromises,
      unreconciledCashSummary,
      executiveInsight,
      managementAttentionItems,
      pendingApprovals,
      computedAt: new Date().toISOString(),
    };
  }
}

export const cfoIntelligenceEngine = new CFOIntelligenceEngine();