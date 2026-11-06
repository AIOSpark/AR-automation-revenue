// AIOSpark Rule-Based Customer Risk Scoring & Profile Engine (Layer 12)

import { udmStore } from '../udm/store';
import { Customer, Invoice, Payment, Dispute } from '../udm/types';
import { EvidenceItem } from '../intelligence/ai-analysis-contract';
import { promiseStore } from '../promises/store';

export interface CustomerFinancialProfile {
  customerId: string;
  customerName: string;
  creditLimitMinorUnits: number;
  totalOutstandingMinorUnits: number;
  totalOverdueMinorUnits: number;
  avgPaymentTimeDaysT12M: number;
  riskScore: number; // 0 to 100
  riskBand: 'high' | 'medium' | 'low';
  riskEvidence: EvidenceItem[];
}

/**
 * Computes transparent, explainable 0-100 Customer Risk Score and Financial Profile.
 * Formula (100% Explainable Rule-Based Matrix):
 * - % Overdue Invoices Rate (40% weight)
 * - Trailing 12-Month Average Payment Delay Days (40% weight)
 * - Dispute Frequency Rate (20% weight)
 * - Broken Promises Rate (Gracefully neutral 0 weight until Layer 20 exists)
 */
export function computeCustomerFinancialProfile(
  customerId: string,
  orgId: string,
  todayStr?: string
): CustomerFinancialProfile {
  udmStore.setTenantContext(orgId);
  const today = todayStr || new Date().toISOString().split('T')[0];
  const todayMs = new Date(today).getTime();
  const oneYearAgoMs = todayMs - 365 * 24 * 60 * 60 * 1000;

  const customers = udmStore.getCustomers();
  const customer = customers.find((c) => c.id === customerId);
  const customerName = customer ? customer.name : 'Unknown Customer';

  const allInvoices = udmStore.getInvoices().filter((i) => i.customer_id === customerId);
  const allPayments = udmStore.getPayments().filter((p) => p.customer_id === customerId);
  const allDisputes = udmStore.getDisputes().filter((d) => {
    const inv = allInvoices.find((i) => i.id === d.invoice_id);
    return !!inv;
  });
  const allMatches = udmStore.getMatches();

  let totalOutstandingMinorUnits = 0;
  let totalOverdueMinorUnits = 0;
  let totalInvoiceCount = allInvoices.length;
  let overdueInvoiceCount = 0;

  let totalDelayDaysSum = 0;
  let paidT12MCount = 0;

  for (const inv of allInvoices) {
    const matches = allMatches.filter((m) => m.invoice_id === inv.id);
    const paidSum = matches.reduce((acc, m) => acc + m.matched_amount_minor_units, 0);
    const outstanding = Math.max(0, inv.amount_minor_units - paidSum);

    if (['open', 'partially_paid', 'disputed'].includes(inv.status)) {
      totalOutstandingMinorUnits += outstanding;
      if (inv.due_date < today) {
        totalOverdueMinorUnits += outstanding;
        overdueInvoiceCount++;
      }
    }

    // Trailing 12-Month Paid Invoice Delay Calculation
    if (inv.status === 'paid') {
      const issueMs = new Date(inv.issue_date).getTime();
      if (issueMs >= oneYearAgoMs) {
        // Find match payment date
        const match = matches[0];
        if (match) {
          const pay = allPayments.find((p) => p.id === match.payment_id);
          if (pay) {
            const payMs = new Date(pay.date).getTime();
            const dueMs = new Date(inv.due_date).getTime();
            const delayDays = Math.max(0, Math.floor((payMs - dueMs) / (1000 * 60 * 60 * 24)));
            totalDelayDaysSum += delayDays;
            paidT12MCount++;
          }
        }
      }
    }
  }

  // 1. Metric: % Overdue Invoices
  const overdueRate = totalInvoiceCount > 0 ? (overdueInvoiceCount / totalInvoiceCount) * 100 : 0;

  // 2. Metric: Avg Payment Time (Trailing 12 Months)
  const avgPaymentTimeDaysT12M = paidT12MCount > 0 ? Math.round(totalDelayDaysSum / paidT12MCount) : 0;

  // 3. Metric: Dispute Frequency Rate
  const disputeRate = totalInvoiceCount > 0 ? (allDisputes.length / totalInvoiceCount) * 100 : 0;

  // 4. Metric: Broken Promise Rate (Layer 20 Real Weighted Integration)
  const promiseStats = promiseStore.getBrokenPromiseStats(orgId, customerId, today);
  const brokenPromiseRate = promiseStats.brokenPromiseRate;

  // COMPUTE RISK SCORE (0 to 100)
  // Overdue Rate Component (30 pts max)
  const overdueScore = Math.min(30, (overdueRate / 50) * 30);

  // Payment Delay Component (30 pts max: 30+ days delay = 30 pts)
  const delayScore = Math.min(30, (avgPaymentTimeDaysT12M / 30) * 30);

  // Dispute Rate Component (20 pts max: 20%+ dispute rate = 20 pts)
  const disputeScore = Math.min(20, (disputeRate / 20) * 20);

  // Broken Promise Component (20 pts max: 50%+ broken rate = 20 pts)
  const brokenPromiseScore = Math.min(20, (brokenPromiseRate / 50) * 20);

  const riskScore = Math.round(Math.min(100, overdueScore + delayScore + disputeScore + brokenPromiseScore));
  const riskBand: 'high' | 'medium' | 'low' = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

  // "WHY THIS SCORE" STRUCTURED EVIDENCE BREAKDOWN (REUSES LAYER 11 CONTRACT)
  const riskEvidence: EvidenceItem[] = [
    {
      label: 'Overdue Invoices Rate',
      value: `${Math.round(overdueRate)}% (${overdueInvoiceCount} of ${totalInvoiceCount})`,
      comparisonLabel: 'Risk Weight Impact',
      comparisonValue: `${Math.round(overdueScore)} / 30 pts`,
      delta: overdueRate > 25 ? 'High Overdue' : 'Normal Overdue',
    },
    {
      label: 'Avg. Payment Delay (Trailing 12 Months)',
      value: `${avgPaymentTimeDaysT12M} days late`,
      comparisonLabel: 'Risk Weight Impact',
      comparisonValue: `${Math.round(delayScore)} / 30 pts`,
      delta: avgPaymentTimeDaysT12M > 15 ? 'High Delay' : 'Normal Delay',
    },
    {
      label: 'Dispute Frequency',
      value: `${allDisputes.length} disputes logged`,
      comparisonLabel: 'Risk Weight Impact',
      comparisonValue: `${Math.round(disputeScore)} / 20 pts`,
      delta: allDisputes.length > 1 ? 'Frequent Disputes' : 'Low Disputes',
    },
    {
      label: 'Broken Promises Rate (Layer 20 Active)',
      value: `${brokenPromiseRate}% (${promiseStats.brokenPromises} of ${promiseStats.resolvedPromises} promises)`,
      comparisonLabel: 'Risk Weight Impact',
      comparisonValue: `${Math.round(brokenPromiseScore)} / 20 pts`,
      delta: brokenPromiseRate > 25 ? 'High Broken Promises' : 'Low Broken Promises',
    },
  ];

  return {
    customerId,
    customerName,
    creditLimitMinorUnits: customer?.credit_limit_minor_units ?? 0,
    totalOutstandingMinorUnits,
    totalOverdueMinorUnits,
    avgPaymentTimeDaysT12M,
    riskScore,
    riskBand,
    riskEvidence,
  };
}
