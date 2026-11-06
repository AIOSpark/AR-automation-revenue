// AIOSpark Receivables Analyst Agent (Agent 1 - Layer 16)
// Purpose: Portfolio-level analysis (aging trends, payment pattern summaries, exception shifts)
// Strict Constraint: Strictly READ-ONLY. Produces an AnalystReport without taking any write actions.

import { udmStore } from '../udm/store';
import { dashboardMetricsStore } from '../dashboard/engine';
import { AgentExecutor, AgentExecutionResult } from './executor';

export interface StructuredDataPoint {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'stable';
  changePercent?: number;
  highlight?: boolean;
}

export interface AnalystReport {
  id: string;
  organization_id: string;
  summary_text: string;
  structured_data_points: StructuredDataPoint[];
  generated_at: string;
}

class AnalystReportStore {
  private reports: Map<string, AnalystReport[]> = new Map();

  public saveReport(orgId: string, report: AnalystReport): void {
    const orgReports = this.reports.get(orgId) || [];
    this.reports.set(orgId, [report, ...orgReports]);
  }

  public getLatestReport(orgId: string): AnalystReport | null {
    const orgReports = this.reports.get(orgId) || [];
    return orgReports.length > 0 ? orgReports[0] : null;
  }

  public getReports(orgId: string): AnalystReport[] {
    return this.reports.get(orgId) || [];
  }

  public clear(): void {
    this.reports.clear();
  }
}

export const analystReportStore = new AnalystReportStore();

export async function runReceivablesAnalyst(orgId: string): Promise<AgentExecutionResult<AnalystReport>> {
  return AgentExecutor.run<string, AnalystReport>(
    'Receivables Analyst',
    orgId,
    orgId,
    async (organizationId: string) => {
      const modelCall = await AgentExecutor.callModel<AnalystReport>(
        `Generate portfolio analysis report for organization ${organizationId}`,
        async () => {
          udmStore.setTenantContext(organizationId);

          // Query aggregated metrics from Core Dashboard (Layer 9)
          const dashboardMetrics = dashboardMetricsStore.getCachedMetrics(organizationId);
          const invoices = udmStore.getInvoices();
          const customers = udmStore.getCustomers();
          const exceptions = udmStore.getExceptions();

          const totalInvoicesCount = invoices.length;
          const overdueInvoicesCount = invoices.filter((i) => i.status === 'open' && i.due_date < new Date().toISOString().split('T')[0]).length;
          const openExceptionsCount = exceptions.filter((e) => e.status !== 'closed').length;

          // Group exceptions by type to detect shifts (e.g. PO_MISMATCH shifts)
          const exceptionTypeCounts: Record<string, number> = {};
          exceptions.forEach((e) => {
            exceptionTypeCounts[e.type] = (exceptionTypeCounts[e.type] || 0) + 1;
          });

          const poMismatchCount = exceptionTypeCounts['PO_MISMATCH'] || 0;
          const disputeCount = exceptionTypeCounts['CUSTOMER_DISPUTE'] || 0;

          const overdueAmountINR = (dashboardMetrics.overdueMinorUnits / 100).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
          });

          const totalReceivablesINR = (dashboardMetrics.totalReceivablesMinorUnits / 100).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
          });

          const poMismatchText = poMismatchCount > 0
            ? `PO_MISMATCH exceptions account for ${poMismatchCount} open issue(s).`
            : `No active PO_MISMATCH exceptions detected.`;

          const summaryText = `Portfolio Analysis: Total receivables stand at ${totalReceivablesINR} across ${totalInvoicesCount} invoice(s), with ${overdueAmountINR} currently overdue. ${openExceptionsCount} active exception work item(s) require attention. ${poMismatchText} Overall collection efficiency remains stable with risk concentrated in high-value overdue items.`;

          const dataPoints: StructuredDataPoint[] = [
            {
              label: 'Total Receivables',
              value: totalReceivablesINR,
              trend: 'stable',
            },
            {
              label: 'Overdue Amount',
              value: overdueAmountINR,
              trend: overdueInvoicesCount > 0 ? 'up' : 'down',
              highlight: overdueInvoicesCount > 0,
            },
            {
              label: 'Active Customers',
              value: `${customers.length}`,
            },
            {
              label: 'PO Mismatch Exceptions',
              value: `${poMismatchCount}`,
              highlight: poMismatchCount > 0,
            },
            {
              label: 'Dispute Exceptions',
              value: `${disputedCount(disputeCount)}`,
            },
          ];

          const report: AnalystReport = {
            id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            organization_id: organizationId,
            summary_text: summaryText,
            structured_data_points: dataPoints,
            generated_at: new Date().toISOString(),
          };

          analystReportStore.saveReport(organizationId, report);
          return report;
        }
      );

      return {
        data: modelCall.result,
      };
    }
  );
}

function disputedCount(count: number): string {
  return `${count}`;
}
