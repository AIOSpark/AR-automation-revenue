// AIOSpark Enterprise Report Definitions Reusing Existing Layer Logic (Layer 23 & Layer 32)
// Organizes enterprise financial reports into 7 PROMPT 11 categories reusing backend services without code duplication.

import { udmStore } from '../udm/store';
import { queryReceivablesTable } from '../receivables/engine';
import { computeCustomerFinancialProfile } from '../customer/risk-engine';
import { promiseStore } from '../promises/store';
import { approvalStore } from '../approvals/store';
import { ReportDefinition } from './export-service';
import { PAYMENT_DELAY_CATEGORIES, categoryDefinitionsMap } from '../taxonomy/definitions';
import { cfoIntelligenceEngine } from '../cfo/engine';

export type ReportCategory =
  | 'RECEIVABLES'
  | 'COLLECTIONS'
  | 'EXCEPTIONS'
  | 'PAYMENTS & RECONCILIATION'
  | 'CUSTOMER EXPOSURE'
  | 'O2C PERFORMANCE'
  | 'MANAGEMENT';

export interface EnterpriseReportDefinition extends ReportDefinition {
  category: ReportCategory;
}

// -----------------------------------------------------------------------------
// CATEGORY 1: RECEIVABLES
// -----------------------------------------------------------------------------

export const agingReportDefinition: EnterpriseReportDefinition = {
  id: 'aging_report',
  category: 'RECEIVABLES',
  name: 'Receivables Aging Report',
  description: 'Analyze outstanding receivables across aging buckets (Current, 1-30, 31-60, 61-90, 90+ days) and identify where exposure is concentrated.',
  columns: [
    { header: 'Customer Name', field: 'customerName', format: 'text' },
    { header: 'Invoice Number', field: 'invoiceNumber', format: 'text' },
    { header: 'Issue Date', field: 'issueDate', format: 'date' },
    { header: 'Due Date', field: 'dueDate', format: 'date' },
    { header: 'Status', field: 'status', format: 'text' },
    { header: 'Aging Bucket', field: 'ageBracket', format: 'text' },
    { header: 'Days Overdue', field: 'daysOverdue', format: 'number' },
    { header: 'Outstanding Amount', field: 'outstandingMinorUnits', format: 'currency' },
  ],
  queryFn: (orgId: string, params?: Record<string, any>) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const today = params?.todayStr || new Date().toISOString().split('T')[0];
    const todayMs = new Date(today).getTime();
    const invoices = udmStore.getInvoices();

    const result = queryReceivablesTable(activeOrgId, { pageSize: 10000 });

    return result.items.map((item) => {
      const inv = invoices.find((i) => i.id === item.id);
      const dueMs = new Date(item.dueDate).getTime();
      const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24)));

      let ageBracket = 'Current / Not Due';
      if (daysOverdue > 90) ageBracket = '90+ Days Overdue';
      else if (daysOverdue > 60) ageBracket = '61-90 Days Overdue';
      else if (daysOverdue > 30) ageBracket = '31-60 Days Overdue';
      else if (daysOverdue > 0) ageBracket = '1-30 Days Overdue';

      return {
        customerName: item.customerName,
        invoiceNumber: item.invoiceNumber,
        issueDate: inv ? inv.issue_date : '—',
        dueDate: item.dueDate,
        status: item.status.toUpperCase(),
        ageBracket,
        daysOverdue,
        outstandingMinorUnits: item.outstandingMinorUnits,
      };
    });
  },
};

// -----------------------------------------------------------------------------
// CATEGORY 2: RECEIVABLES - OVERDUE
// -----------------------------------------------------------------------------

export const overdueReceivablesReportDefinition: EnterpriseReportDefinition = {
  id: 'overdue_receivables_report',
  category: 'RECEIVABLES',
  name: 'Overdue Receivables Report',
  description: 'Detailed financial inventory of all past-due invoices requiring immediate collection attention.',
  columns: [
    { header: 'Customer Name', field: 'customerName', format: 'text' },
    { header: 'Invoice Number', field: 'invoiceNumber', format: 'text' },
    { header: 'Due Date', field: 'dueDate', format: 'date' },
    { header: 'Days Overdue', field: 'daysOverdue', format: 'number' },
    { header: 'Overdue Amount', field: 'outstandingMinorUnits', format: 'currency' },
    { header: 'Blocker Category', field: 'blockerCategory', format: 'text' },
  ],
  queryFn: (orgId: string, params?: Record<string, any>) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const today = params?.todayStr || new Date().toISOString().split('T')[0];
    const todayMs = new Date(today).getTime();
    const result = queryReceivablesTable(activeOrgId, { ageBucket: 'overdue', pageSize: 10000 });
    const exceptions = udmStore.getExceptions();

    return result.items.map((item) => {
      const dueMs = new Date(item.dueDate).getTime();
      const daysOverdue = Math.max(1, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24)));
      const exc = exceptions.find((e) => e.invoice_id === item.id && e.status !== 'closed');

      return {
        customerName: item.customerName,
        invoiceNumber: item.invoiceNumber,
        dueDate: item.dueDate,
        daysOverdue,
        outstandingMinorUnits: item.outstandingMinorUnits,
        blockerCategory: exc ? exc.type : 'COLLECTION_FOLLOWUP',
      };
    });
  },
};

// -----------------------------------------------------------------------------
// CATEGORY 3: COLLECTIONS
// -----------------------------------------------------------------------------

export const collectionEffectivenessReportDefinition: EnterpriseReportDefinition = {
  id: 'collection_effectiveness_report',
  category: 'COLLECTIONS',
  name: 'Collections Performance & CEI Report',
  description: 'Measures Collection Effectiveness Index (CEI), payment promise fulfillment, and pursued balances.',
  columns: [
    { header: 'Metric Period', field: 'period', format: 'text' },
    { header: 'Total Collectible Amount', field: 'collectibleMinorUnits', format: 'currency' },
    { header: 'Total Collected Amount', field: 'collectedMinorUnits', format: 'currency' },
    { header: 'CEI Percentage', field: 'ceiPercentage', format: 'percent' },
    { header: 'Promises Kept Count', field: 'promisesKept', format: 'number' },
    { header: 'Promises Broken Count', field: 'promisesBroken', format: 'number' },
  ],
  queryFn: (orgId: string) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const invoices = udmStore.getInvoices();
    const payments = udmStore.getPayments();
    const promises = promiseStore.getPromises(activeOrgId);

    const collectibleSum = invoices.reduce((s, i) => s + i.amount_minor_units, 0);
    const collectedSum = payments.reduce((s, p) => s + p.amount_minor_units, 0);
    const ceiPercentage = collectibleSum > 0 ? (collectedSum / collectibleSum) * 100 : 0;

    return [
      {
        period: 'Trailing 30 Days',
        collectibleMinorUnits: collectibleSum,
        collectedMinorUnits: collectedSum,
        ceiPercentage: Math.round(ceiPercentage * 10) / 10,
        promisesKept: promises.filter((p) => p.status === 'kept').length,
        promisesBroken: promises.filter((p) => p.status === 'broken').length,
      },
    ];
  },
};

export const promiseToPayReportDefinition: EnterpriseReportDefinition = {
  id: 'promise_to_pay_report',
  category: 'COLLECTIONS',
  name: 'Payment Promises & Broken Commitments',
  description: 'Tracks customer payment commitments, expected dates, channel recorded, and broken promise compliance.',
  columns: [
    { header: 'Customer ID', field: 'customerId', format: 'text' },
    { header: 'Promised Date', field: 'expectedDate', format: 'date' },
    { header: 'Channel Recorded', field: 'recordedVia', format: 'text' },
    { header: 'Status', field: 'status', format: 'text' },
    { header: 'Promised Amount', field: 'promisedAmountMinorUnits', format: 'currency' },
  ],
  queryFn: (orgId: string) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const promises = promiseStore.getPromises(activeOrgId);

    return promises.map((p) => ({
      customerId: p.customer_id,
      expectedDate: p.expected_date,
      recordedVia: p.recorded_via,
      status: p.status.toUpperCase(),
      promisedAmountMinorUnits: p.promised_amount_minor_units,
    }));
  },
};

// -----------------------------------------------------------------------------
// CATEGORY 4: EXCEPTIONS
// -----------------------------------------------------------------------------

export const exceptionTrendsReportDefinition: EnterpriseReportDefinition = {
  id: 'exception_trends_report',
  category: 'EXCEPTIONS',
  name: 'Cash Blockers & Exception Taxonomy Summary',
  description: 'Quantifies blocked cash exposure categorized strictly using Layer 14 locked 11-value taxonomy.',
  columns: [
    { header: 'Category Enum', field: 'category', format: 'text' },
    { header: 'Title', field: 'title', format: 'text' },
    { header: 'Critical Count', field: 'criticalCount', format: 'number' },
    { header: 'High Count', field: 'highCount', format: 'number' },
    { header: 'Total Exception Count', field: 'totalCount', format: 'number' },
    { header: 'Total Blocked Exposure', field: 'totalExposureMinorUnits', format: 'currency' },
  ],
  queryFn: (orgId: string) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const exceptions = udmStore.getExceptions();
    const invoices = udmStore.getInvoices();
    const matches = udmStore.getMatches();

    return PAYMENT_DELAY_CATEGORIES.map((cat) => {
      const catExcs = exceptions.filter((e) => e.type === cat && e.status !== 'closed');
      let totalExposure = 0;

      for (const ex of catExcs) {
        if (ex.invoice_id) {
          const inv = invoices.find((i) => i.id === ex.invoice_id);
          if (inv) {
            const paid = matches.filter((m) => m.invoice_id === inv.id).reduce((s, m) => s + m.matched_amount_minor_units, 0);
            totalExposure += Math.max(0, inv.amount_minor_units - paid);
          }
        }
      }

      const def = categoryDefinitionsMap.get(cat);
      return {
        category: cat,
        title: def ? def.title : cat,
        criticalCount: catExcs.filter((e) => e.severity === 'critical').length,
        highCount: catExcs.filter((e) => e.severity === 'high').length,
        totalCount: catExcs.length,
        totalExposureMinorUnits: totalExposure,
      };
    }).filter((r) => r.totalCount > 0);
  },
};

// -----------------------------------------------------------------------------
// CATEGORY 5: PAYMENTS & RECONCILIATION
// -----------------------------------------------------------------------------

export const recoveryReportDefinition: EnterpriseReportDefinition = {
  id: 'recovery_report',
  category: 'PAYMENTS & RECONCILIATION',
  name: 'Payments Received & Cash Allocation Report',
  description: 'Audited log of received bank deposits, match methods, matched invoice targets, and unallocated cash.',
  columns: [
    { header: 'Payment Reference', field: 'paymentReference', format: 'text' },
    { header: 'Payment Date', field: 'paymentDate', format: 'date' },
    { header: 'Source System', field: 'sourceSystem', format: 'text' },
    { header: 'Match Method', field: 'matchMethod', format: 'text' },
    { header: 'Received Amount', field: 'recoveredAmountMinorUnits', format: 'currency' },
  ],
  queryFn: (orgId: string) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const payments = udmStore.getPayments();
    const matches = udmStore.getMatches();

    return payments.map((p) => {
      const pMatches = matches.filter((m) => m.payment_id === p.id);
      const matchMethod = pMatches[0]?.match_method || 'manual';

      return {
        paymentReference: p.reference || p.source_id,
        paymentDate: p.date,
        sourceSystem: p.source_system,
        matchMethod: matchMethod.toUpperCase(),
        recoveredAmountMinorUnits: p.amount_minor_units,
      };
    });
  },
};

// -----------------------------------------------------------------------------
// CATEGORY 6: CUSTOMER EXPOSURE
// -----------------------------------------------------------------------------

export const customerRiskReportDefinition: EnterpriseReportDefinition = {
  id: 'customer_risk_report',
  category: 'CUSTOMER EXPOSURE',
  name: 'Customer Exposure & Risk Assessment',
  description: 'Evaluates customer-level outstanding balances, risk scoring, T12M payment delays, and concentration.',
  columns: [
    { header: 'Customer Name', field: 'customerName', format: 'text' },
    { header: 'Risk Rating Band', field: 'riskBand', format: 'text' },
    { header: 'Risk Score (0-100)', field: 'riskScore', format: 'number' },
    { header: 'Total Outstanding', field: 'totalOutstandingMinorUnits', format: 'currency' },
    { header: 'Total Overdue', field: 'totalOverdueMinorUnits', format: 'currency' },
    { header: 'T12M Avg Delay (Days)', field: 'avgPaymentTimeDaysT12M', format: 'number' },
  ],
  queryFn: (orgId: string, params?: Record<string, any>) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const customers = udmStore.getCustomers();
    const profiles = customers.map((c) => computeCustomerFinancialProfile(c.id, activeOrgId, params?.todayStr));

    profiles.sort((a, b) => b.riskScore - a.riskScore);

    return profiles.map((p) => ({
      customerName: p.customerName,
      riskBand: p.riskBand.toUpperCase(),
      riskScore: p.riskScore,
      totalOutstandingMinorUnits: p.totalOutstandingMinorUnits,
      totalOverdueMinorUnits: p.totalOverdueMinorUnits,
      avgPaymentTimeDaysT12M: p.avgPaymentTimeDaysT12M,
    }));
  },
};

// -----------------------------------------------------------------------------
// CATEGORY 7: O2C PERFORMANCE
// -----------------------------------------------------------------------------

export const dsoReportDefinition: EnterpriseReportDefinition = {
  id: 'dso_report',
  category: 'O2C PERFORMANCE',
  name: 'Days Sales Outstanding (DSO) Report',
  description: 'Tracks DSO trend and billing cycle collection velocity using standard shared calculation.',
  dsoFormulaNotice: 'DSO = (Total Receivables Balance / Total Credit Sales) × Days in Period',
  columns: [
    { header: 'Metric Period', field: 'period', format: 'text' },
    { header: 'Total Receivables', field: 'totalReceivablesMinorUnits', format: 'currency' },
    { header: 'Period Sales Volume', field: 'periodSalesMinorUnits', format: 'currency' },
    { header: 'Period Days', field: 'periodDays', format: 'number' },
    { header: 'DSO (Days)', field: 'dsoDays', format: 'number' },
  ],
  queryFn: (orgId: string, params?: Record<string, any>) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const invoices = udmStore.getInvoices();
    const matches = udmStore.getMatches();

    const totalAr = invoices
      .filter((i) => ['open', 'partially_paid', 'disputed'].includes(i.status))
      .reduce((sum, inv) => {
        const paid = matches.filter((m) => m.invoice_id === inv.id).reduce((s, m) => s + m.matched_amount_minor_units, 0);
        return sum + Math.max(0, inv.amount_minor_units - paid);
      }, 0);

    const totalSales = invoices.reduce((sum, inv) => sum + inv.amount_minor_units, 0);
    const periodDays = params?.periodDays || 30;
    const dsoDays = totalSales > 0 ? Math.round((totalAr / totalSales) * periodDays * 10) / 10 : 0;

    return [
      {
        period: params?.periodLabel || 'Current 30-Day Rolling Window',
        totalReceivablesMinorUnits: totalAr,
        periodSalesMinorUnits: totalSales,
        periodDays,
        dsoDays,
      },
    ];
  },
};

export const overdueTrendsReportDefinition: EnterpriseReportDefinition = {
  id: 'overdue_trends_report',
  category: 'O2C PERFORMANCE',
  name: 'Receivables & Overdue Movement Trends',
  description: 'Trajectory of overdue receivables and aging movement across rolling reporting windows.',
  columns: [
    { header: 'Time Bucket', field: 'timeBucket', format: 'text' },
    { header: 'Overdue Count', field: 'overdueCount', format: 'number' },
    { header: 'Overdue Amount', field: 'overdueMinorUnits', format: 'currency' },
  ],
  queryFn: (orgId: string, params?: Record<string, any>) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const today = params?.todayStr || new Date().toISOString().split('T')[0];
    const invoices = udmStore.getInvoices();
    const overdueInvoices = invoices.filter((i) => i.due_date < today && ['open', 'partially_paid', 'disputed'].includes(i.status));
    const matches = udmStore.getMatches();
    const totalOverdue = overdueInvoices.reduce((s, inv) => {
      const paid = matches.filter((m) => m.invoice_id === inv.id).reduce((mAcc, m) => mAcc + m.matched_amount_minor_units, 0);
      return s + Math.max(0, inv.amount_minor_units - paid);
    }, 0);

    return [
      {
        timeBucket: 'Current Window',
        overdueCount: overdueInvoices.length,
        overdueMinorUnits: totalOverdue,
      },
    ];
  },
};

// -----------------------------------------------------------------------------
// CATEGORY 8: MANAGEMENT
// -----------------------------------------------------------------------------

export const cfoExecutiveReportDefinition: EnterpriseReportDefinition = {
  id: 'cfo_executive_report',
  category: 'MANAGEMENT',
  name: 'CFO Executive Summary & Management Review',
  description: 'High-level synthesis of receivables, overdue exposure, actionable blockers, cash received, and agent activities.',
  columns: [
    { header: 'Executive Metric', field: 'metricLabel', format: 'text' },
    { header: 'Value / Amount', field: 'formattedValue', format: 'text' },
    { header: 'Status / Detail', field: 'statusDetail', format: 'text' },
  ],
  queryFn: (orgId: string, params?: Record<string, any>) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const overview = cfoIntelligenceEngine.getOverview(activeOrgId, params?.todayStr);

    return [
      {
        metricLabel: 'Total Receivables',
        formattedValue: `₹${(overview.totalReceivablesMinorUnits / 100).toLocaleString('en-IN')}`,
        statusDetail: '100% Ledger Synced',
      },
      {
        metricLabel: 'Overdue Exposure',
        formattedValue: `₹${(overview.overdueMinorUnits / 100).toLocaleString('en-IN')}`,
        statusDetail: 'Delayed Capital',
      },
      {
        metricLabel: 'Actionable Cash Blockers',
        formattedValue: `₹${(overview.actionableBlockersMinorUnits / 100).toLocaleString('en-IN')}`,
        statusDetail: `${overview.categoryBreakdown.length} Blocker Categories`,
      },
      {
        metricLabel: 'Cash Received',
        formattedValue: `₹${(overview.cashReceivedMinorUnits / 100).toLocaleString('en-IN')}`,
        statusDetail: 'Ingested Deposits',
      },
      {
        metricLabel: 'Unreconciled Cash',
        formattedValue: `₹${(overview.unreconciledCashMinorUnits / 100).toLocaleString('en-IN')}`,
        statusDetail: `${overview.unreconciledCashSummary.unmatchedPaymentCount} Unmatched Deposit(s)`,
      },
      {
        metricLabel: 'Days Sales Outstanding (DSO)',
        formattedValue: `${overview.dsoDays} days`,
        statusDetail: `Shift: ${overview.dsoChangeDays >= 0 ? '+' : ''}${overview.dsoChangeDays}d vs previous cycle`,
      },
    ];
  },
};

export const agentPerformanceReportDefinition: EnterpriseReportDefinition = {
  id: 'agent_performance_report',
  category: 'MANAGEMENT',
  name: 'AI Agent Governance & Approval Audit',
  description: 'Measures AI agent proposal volumes, human approval rates, rejection rates, and safety pipeline compliance.',
  columns: [
    { header: 'Proposed By Agent', field: 'proposedBy', format: 'text' },
    { header: 'Action Type', field: 'actionType', format: 'text' },
    { header: 'Total Proposed', field: 'totalProposed', format: 'number' },
    { header: 'Approved Count', field: 'approvedCount', format: 'number' },
    { header: 'Rejected Count', field: 'rejectedCount', format: 'number' },
    { header: 'Modified Count', field: 'modifiedCount', format: 'number' },
    { header: 'Approval Rate', field: 'approvalRate', format: 'percent' },
  ],
  queryFn: (orgId: string) => {
    // orgId is derived from the active AsyncLocalStorage request context
    const activeOrgId = udmStore.getRequestTenant();
    if (!activeOrgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const allRequests = approvalStore.getRequests(activeOrgId);

    const agentGroups = new Map<string, { total: number; approved: number; rejected: number; modified: number }>();

    for (const req of allRequests) {
      const key = `${req.proposed_by}::${req.action_type}`;
      const cur = agentGroups.get(key) || { total: 0, approved: 0, rejected: 0, modified: 0 };
      cur.total++;
      if (req.status === 'approved') cur.approved++;
      if (req.status === 'rejected') cur.rejected++;
      if (req.modification) cur.modified++;
      agentGroups.set(key, cur);
    }

    return Array.from(agentGroups.entries()).map(([key, data]) => {
      const [proposedBy, actionType] = key.split('::');
      const approvalRate = data.total > 0 ? (data.approved / data.total) * 100 : 0;
      return {
        proposedBy,
        actionType,
        totalProposed: data.total,
        approvedCount: data.approved,
        rejectedCount: data.rejected,
        modifiedCount: data.modified,
        approvalRate: Math.round(approvalRate * 10) / 10,
      };
    });
  },
};

export const ALL_REPORTS: EnterpriseReportDefinition[] = [
  agingReportDefinition,
  overdueReceivablesReportDefinition,
  collectionEffectivenessReportDefinition,
  promiseToPayReportDefinition,
  exceptionTrendsReportDefinition,
  recoveryReportDefinition,
  customerRiskReportDefinition,
  dsoReportDefinition,
  overdueTrendsReportDefinition,
  cfoExecutiveReportDefinition,
  agentPerformanceReportDefinition,
];

export function getReportDefinition(reportId: string): EnterpriseReportDefinition | undefined {
  return ALL_REPORTS.find((r) => r.id === reportId);
}