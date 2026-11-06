// AIOSpark Investigation Agent (Agent 2 - Layer 16)
// Purpose: Investigates why an invoice/exception is blocked by reusing Layer 13's analyzeInvoice reasoning engine.
// Returns Layer 13's AIAnalysis shape so it renders directly in Layer 11 UI without modifications.

import { udmStore } from '../udm/store';
import { analyzeInvoice } from '../intelligence/reasoning-engine';
import { AIAnalysis } from '../intelligence/ai-analysis-contract';
import { AgentExecutor, AgentExecutionResult } from './executor';

export interface InvestigationInput {
  invoiceId?: string;
  customerId?: string;
  exceptionId?: string;
  organizationId: string;
  investigationType?: 'invoice' | 'customer' | 'exception' | 'receivable';
  extendedContextDocs?: string[];
  userRole?: string;
}

export async function runInvestigationAgent(
  input: InvestigationInput
): Promise<AgentExecutionResult<AIAnalysis>> {
  return AgentExecutor.run<InvestigationInput, AIAnalysis>(
    'Investigation Agent',
    input.organizationId,
    input,
    async (params: InvestigationInput) => {
      const modelCall = await AgentExecutor.callModel<AIAnalysis>(
        `Analyze O2C context for organization ${params.organizationId} (Invoice: ${params.invoiceId || 'N/A'}, Customer: ${params.customerId || 'N/A'}, Exception: ${params.exceptionId || 'N/A'})`,
        async () => {
          udmStore.setTenantContext(params.organizationId);

          let targetInvoiceId = params.invoiceId;

          // If exceptionId provided, resolve invoice/customer from exception
          if (!targetInvoiceId && params.exceptionId) {
            const exceptions = udmStore.getExceptions();
            const exc = exceptions.find((e) => e.id === params.exceptionId);
            if (exc && exc.invoice_id) {
              targetInvoiceId = exc.invoice_id;
            }
          }

          // If customerId provided without invoiceId, pick customer's highest overdue invoice for reasoning analysis
          if (!targetInvoiceId && params.customerId) {
            const invoices = udmStore.getInvoices().filter((i) => i.customer_id === params.customerId && i.status !== 'paid');
            if (invoices.length > 0) {
              invoices.sort((a, b) => a.due_date.localeCompare(b.due_date));
              targetInvoiceId = invoices[0].id;
            }
          }

          let baseAnalysis: AIAnalysis;
          if (targetInvoiceId) {
            baseAnalysis = await analyzeInvoice(targetInvoiceId, params.organizationId);
          } else {
            // Customer level or general fallback analysis
            baseAnalysis = {
              conclusion: 'Insufficient specific invoice/exception evidence to determine root cause',
              category: 'UNKNOWN',
              confidence: 0.4,
              evidence: [],
              source: 'Investigation Agent Context Builder',
              generatedAt: new Date().toISOString(),
            };
          }

          let finalAnalysis = baseAnalysis;

          // Enrich evidence with context tags
          const contextEvidence = [];
          if (params.investigationType) {
            contextEvidence.push({
              label: 'Investigation Scope',
              value: params.investigationType.toUpperCase(),
              comparisonLabel: 'Target ID',
              comparisonValue: params.invoiceId || params.customerId || params.exceptionId || 'N/A',
            });
          }

          if (params.extendedContextDocs && params.extendedContextDocs.length > 0) {
            params.extendedContextDocs.forEach((doc) => {
              contextEvidence.push({
                label: 'Attached Document / Delivery Record',
                value: doc,
                comparisonLabel: 'Source',
                comparisonValue: 'Investigation Agent Document Parser',
              });
            });
          }

          finalAnalysis = {
            ...baseAnalysis,
            evidence: [...baseAnalysis.evidence, ...contextEvidence],
            source: `Investigation Agent (${baseAnalysis.source})`,
          };

          return finalAnalysis;
        }
      );

      return {
        data: modelCall.result,
      };
    }
  );
}
