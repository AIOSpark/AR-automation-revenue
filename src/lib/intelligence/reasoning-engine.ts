// AIOSpark AI Reasoning Engine (Layer 13)
// Uses real LLM invocation with evidence grounding for invoice root-cause analysis.
// Financial calculations remain deterministic application logic - the LLM is not
// the source of financial truth.

import { billingStore } from '../billing/store';
import { udmStore } from '../udm/store';
import { Invoice, Customer, Dispute, Payment } from '../udm/types';
import { dataQualityStore } from '../quality/engine';
import { AIAnalysis, EvidenceItem } from '../intelligence/ai-analysis-contract';

import { PaymentDelayCategory, isValidTaxonomyCategory, categoryDefinitionsMap } from '../taxonomy/definitions';
import { AgentExecutor } from '../agents/executor';
import { promptManager } from '../llm/prompt-manager';

export const CURRENT_MODEL_PROMPT_VERSION = 'AIOSpark-O2C-Reasoning-v2.0.0';

export interface ReasoningContextSlice {
  invoice: Invoice;
  customer: Customer | null;
  poReference?: string | null;
  deliveryReference?: string | null;
  disputes: Dispute[];
  recentPayments: Payment[];
  hasDataQualityFlag: boolean;
  dataQualityMessage?: string | null;
}

/**
 * 1. CONTEXT BUILDER (Narrow, purpose-built context slice assembly)
 * All data comes from UDM - the LLM never invents financial figures.
 */
export function buildReasoningContext(invoiceId: string, orgId: string): ReasoningContextSlice | null {
  udmStore.setTenantContext(orgId);
  const invoices = udmStore.getInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);

  if (!invoice) return null;

  const customers = udmStore.getCustomers();
  const customer = customers.find((c) => c.id === invoice.customer_id) || null;

  const disputes = udmStore.getDisputes().filter((d) => d.invoice_id === invoiceId && d.status !== 'rejected');
  const recentPayments = udmStore
    .getPayments()
    .filter((p) => p.customer_id === invoice.customer_id)
    .slice(-5);

  const dqFlag = dataQualityStore.getDataQualityFlag('invoice', invoiceId);

  return {
    invoice,
    customer,
    poReference: invoice.po_reference,
    deliveryReference: invoice.delivery_reference,
    disputes,
    recentPayments,
    hasDataQualityFlag: !!dqFlag,
    dataQualityMessage: dqFlag ? dqFlag.message : null,
  };
}

/**
 * 2. DETERMINISTIC CONFIDENCE CALCULATION
 * Explicitly caps confidence at 0.5 if Layer 8 reports an open Data Quality Flag.
 */
export function calculateReasoningConfidence(baseConfidence: number, hasDataQualityFlag: boolean): number {
  if (hasDataQualityFlag) {
    return Math.min(0.5, baseConfidence - 0.25);
  }
  return Math.min(1.0, Math.max(0.0, baseConfidence));
}

/**
 * 3. FALLBACK GENERATOR (Graceful non-crashing fallback on schema failure)
 */
export function getSafeFallbackAnalysis(sourceName: string = 'O2C Reasoning Engine Fallback'): AIAnalysis {
  return {
    conclusion: 'Needs investigation — inconclusive reasoning signals',
    category: 'UNKNOWN',
    confidence: 0,
    evidence: [],
    source: sourceName,
    generatedAt: new Date().toISOString(),
    modelVersion: CURRENT_MODEL_PROMPT_VERSION,
  };
}

/**
 * Deterministic fallback analysis when LLM is unavailable.
 * Uses only verified UDM data - never fabricates financial figures.
 */
function deterministicFallbackAnalysis(context: ReasoningContextSlice): AIAnalysis {
  const { invoice, customer, disputes, hasDataQualityFlag, dataQualityMessage } = context;

  // Determine category based on verified UDM state
  let category: PaymentDelayCategory = 'UNKNOWN';
  let conclusion: string;
  let confidence: number;
  const evidence: EvidenceItem[] = [];

  if (disputes.length > 0) {
    category = 'CUSTOMER_DISPUTE';
    confidence = 0.95;
    conclusion = `Invoice payment blocked by active buyer dispute: ${disputes[0].reason}`;
    evidence.push({
      label: 'Invoice Number',
      value: invoice.number,
      comparisonLabel: 'Status',
      comparisonValue: invoice.status,
    });
    evidence.push({
      label: 'Dispute Reason',
      value: disputes[0].reason,
      comparisonLabel: 'Dispute Status',
      comparisonValue: disputes[0].status,
    });
  } else if (invoice.po_reference && invoice.po_reference.includes('MISMATCH')) {
    category = 'PO_MISMATCH';
    confidence = 0.92;
    conclusion = 'Invoice payment blocked by PO reference mismatch';
    evidence.push({
      label: 'PO Reference',
      value: invoice.po_reference,
      comparisonLabel: 'Invoice Number',
      comparisonValue: invoice.number,
    });
    evidence.push({
      label: 'Invoice Amount',
      value: `${(invoice.amount_minor_units / 100).toLocaleString('en-IN')} ${invoice.currency}`,
      comparisonLabel: 'PO Reference',
      comparisonValue: invoice.po_reference,
    });
  } else if (invoice.status === 'open' && !hasDataQualityFlag) {
    category = 'NORMAL_CYCLE';
    confidence = 0.88;
    conclusion = 'Invoice is processing normally within contracted credit terms';
    evidence.push({
      label: 'Invoice Number',
      value: invoice.number,
      comparisonLabel: 'Status',
      comparisonValue: invoice.status,
    });
    evidence.push({
      label: 'Payment Terms',
      value: `${customer?.payment_terms_days || 30} days`,
      comparisonLabel: 'Invoice Status',
      comparisonValue: invoice.status,
    });
  } else if (hasDataQualityFlag) {
    category = 'INVOICE_ERROR';
    confidence = 0.5;
    conclusion = 'Invoice requires data correction before automated reasoning can complete';
    evidence.push({
      label: 'Invoice Number',
      value: invoice.number,
      comparisonLabel: 'Status',
      comparisonValue: invoice.status,
    });
    evidence.push({
      label: 'Data Quality Issue',
      value: dataQualityMessage || 'Unverified invoice payload',
      comparisonLabel: 'Confidence Cap',
      comparisonValue: '0.50 Max',
    });
  } else {
    category = 'UNKNOWN';
    confidence = 0.4;
    conclusion = 'Insufficient evidence to determine root cause. Manual review required.';
    evidence.push({
      label: 'Invoice Number',
      value: invoice.number,
      comparisonLabel: 'Status',
      comparisonValue: invoice.status,
    });
  }

  // Cap confidence based on data quality
  const finalConfidence = calculateReasoningConfidence(confidence, hasDataQualityFlag);

  return {
    conclusion,
    category,
    confidence: finalConfidence,
    evidence,
    source: 'O2C Reasoning Engine (Deterministic Fallback)',
    generatedAt: new Date().toISOString(),
    modelVersion: CURRENT_MODEL_PROMPT_VERSION,
  };
}

/**
 * Build evidence context string from UDM data for the LLM.
 * Only includes verified data - no invented figures.
 */
function buildEvidenceContext(context: ReasoningContextSlice): string {
  const lines: string[] = [];

  lines.push(`Invoice Number: ${context.invoice.number}`);
  lines.push(`Invoice Amount: ${(context.invoice.amount_minor_units / 100).toLocaleString('en-IN')} ${context.invoice.currency}`);
  lines.push(`Issue Date: ${context.invoice.issue_date}`);
  lines.push(`Due Date: ${context.invoice.due_date}`);
  lines.push(`Status: ${context.invoice.status}`);
  lines.push(`PO Reference: ${context.poReference || 'Not recorded'}`);
  lines.push(`Delivery Reference: ${context.deliveryReference || 'Not recorded'}`);

  if (context.customer) {
    lines.push(`Customer Name: ${context.customer.name}`);
    lines.push(`Customer Payment Terms: ${context.customer.payment_terms_days} days`);
    lines.push(`Customer Credit Limit: ${(context.customer.credit_limit_minor_units / 100).toLocaleString('en-IN')} ${context.customer.currency}`);
  }

  if (context.disputes.length > 0) {
    lines.push('Disputes:');
    for (const d of context.disputes) {
      lines.push(`  - ${d.reason} (Status: ${d.status}, Amount: ${d.amount_minor_units ? (d.amount_minor_units / 100).toLocaleString('en-IN') : 'Full amount'})`);
    }
  }

  if (context.recentPayments.length > 0) {
    lines.push('Recent Payments:');
    for (const p of context.recentPayments) {
      lines.push(`  - ${p.date}: ${(p.amount_minor_units / 100).toLocaleString('en-IN')} ${p.currency} (Reference: ${p.reference || 'None'})`);
    }
  }

  if (context.hasDataQualityFlag) {
    lines.push(`Data Quality Flag: ${context.dataQualityMessage}`);
  }

  return lines.join('\n');
}

/**
 * Validate that evidence items reference actual UDM records.
 * Rejects any evidence that references non-existent or mismatched data.
 */
function validateEvidenceAgainstUDM(
  evidence: EvidenceItem[],
  context: ReasoningContextSlice,
  orgId: string
): EvidenceItem[] {
  const validated: EvidenceItem[] = [];

  for (const item of evidence) {
    // Check if the evidence references an invoice number that matches
    if (item.label.toLowerCase().includes('invoice') && item.value) {
      const invNum = String(item.value);
      if (invNum !== context.invoice.number) {
        // Evidence references a different invoice - reject
        continue;
      }
    }

    // Check if evidence references a PO that matches
    if (item.label.toLowerCase().includes('po') && item.value) {
      const poVal = String(item.value);
      if (context.poReference && poVal !== context.poReference) {
        // Evidence references a different PO - reject
        continue;
      }
    }

    // Check if evidence references an amount that matches
    if (item.label.toLowerCase().includes('amount') && typeof item.value === 'string') {
      const amountStr = item.value.replace(/[^0-9.]/g, '');
      const amountNum = parseFloat(amountStr);
      if (!isNaN(amountNum)) {
        const invoiceAmount = context.invoice.amount_minor_units / 100;
        if (Math.abs(amountNum - invoiceAmount) > 0.01) {
          // Evidence amount doesn't match invoice - reject
          continue;
        }
      }
    }

    validated.push(item);
  }

  return validated;
}

/**
 * 4. MAIN REASONING ENGINE ENTRYPOINT
 * Accepts an invoice ID and produces a schema-validated, evidence-backed AIAnalysis.
 * Uses real LLM invocation with evidence grounding.
 */
export async function analyzeInvoice(invoiceId: string, orgId: string): Promise<AIAnalysis> {
  try {
    const context = buildReasoningContext(invoiceId, orgId);
    if (!context) {
      return getSafeFallbackAnalysis('Invoice Not Found');
    }

    // Wire Layer 27 Usage Tracking Event
    billingStore.recordEvent({
      organization_id: orgId,
      event_type: 'ai_task.executed',
      quantity: 1,
      metadata: { task_type: 'reasoning_engine', invoice_id: invoiceId },
    });

    // Build evidence context from verified UDM data
    const evidenceContext = buildEvidenceContext(context);

    // Get the investigation prompt template
    const template = promptManager.get('invoice-investigation');
    if (!template) {
      return getSafeFallbackAnalysis('Prompt template not found');
    }

    // Render the prompt with verified context data
    const rendered = promptManager.render('invoice-investigation', {
      evidence_context: evidenceContext,
      invoice_number: context.invoice.number,
      customer_name: context.customer?.name || 'Unknown',
      amount_minor_units: context.invoice.amount_minor_units,
      due_date: context.invoice.due_date,
      status: context.invoice.status,
      po_reference: context.poReference || 'Not recorded',
      delivery_reference: context.deliveryReference || 'Not recorded',
      output_schema: JSON.stringify(template.outputSchema, null, 2),
    });

    if (!rendered) {
      return getSafeFallbackAnalysis('Prompt rendering failed');
    }

    // Invoke the real LLM via AgentExecutor
    const modelResult = await AgentExecutor.callModel<AIAnalysis>(
      rendered.userPrompt,
      {
        outputSchema: template.outputSchema,
        temperature: 0.2,
        maxTokens: 2000,
        organizationId: orgId,
        agentId: 'Investigation Agent',
        taskId: `investigate_${invoiceId}`,
        promptId: template.id,
        promptVersion: template.version,
        promptHash: promptManager.getPromptHash('invoice-investigation') || undefined,
      }
    );

    // Check if the model call succeeded
    if (!modelResult.result || modelResult.tokensUsed === 0) {
      // LLM unavailable — fall back to deterministic rule-based reasoning
      // based on verified UDM context. Never fabricate financial figures.
      return deterministicFallbackAnalysis(context);
    }

    const rawAnalysis = modelResult.result as AIAnalysis;

    // Validate evidence against UDM - reject any evidence that doesn't match
    const validatedEvidence = validateEvidenceAgainstUDM(rawAnalysis.evidence, context, orgId);

    // If no valid evidence remains, mark as unknown
    if (validatedEvidence.length === 0) {
      return {
        ...rawAnalysis,
        conclusion: 'Insufficient verifiable evidence — AI analysis could not be grounded in UDM records. Manual review required.',
        category: 'UNKNOWN',
        confidence: 0,
        evidence: [],
        source: 'O2C Reasoning Engine (Evidence Validation Failed)',
      };
    }

    // Validate category against taxonomy
    let category = rawAnalysis.category;
    if (!isValidTaxonomyCategory(category)) {
      category = 'UNKNOWN';
    }

    // Cap confidence based on data quality
    const finalConfidence = calculateReasoningConfidence(rawAnalysis.confidence, context.hasDataQualityFlag);

    return {
      ...rawAnalysis,
      category,
      confidence: finalConfidence,
      evidence: validatedEvidence,
      source: 'O2C Reasoning Engine (LLM v2.0)',
      generatedAt: new Date().toISOString(),
      modelVersion: CURRENT_MODEL_PROMPT_VERSION,
    };
  } catch (err) {
    // Non-negotiable constraint: Never crash or expose raw errors to user
    return getSafeFallbackAnalysis('Error Protection Boundary');
  }
}
