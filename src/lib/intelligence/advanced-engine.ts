// AIOSpark Advanced Intelligence Layer (Step 08)
// Causal graph, cash unblock simulation, payment probability, action outcome tracking

import { udmStore } from '../udm/store';
import { Invoice, Customer, Dispute, Payment } from '../udm/types';

export interface CausalGraphNode {
  id: string;
  type: 'invoice' | 'customer' | 'exception' | 'dispute' | 'payment' | 'action';
  label: string;
  amount?: number;
  amountMinorUnits?: number;
  status: string;
  children: CausalGraphNode[];
  provenance?: 'VERIFIED' | 'RULE_INFERRED' | 'AI_INFERRED' | 'UNKNOWN';
  metadata?: Record<string, unknown>;
}

export interface CausalGraph {
  root: CausalGraphNode;
  nodes: CausalGraphNode[];
  edges: Array<{ from: string; to: string; label: string; provenance?: 'VERIFIED' | 'RULE_INFERRED' | 'AI_INFERRED' | 'UNKNOWN' }>;
  cashImpactMinorUnits: number;
}

export interface CausalChainSummary {
  root: CausalGraphNode;
  nodes: CausalGraphNode[];
  edges: Array<{ from: string; to: string; label: string; provenance?: 'VERIFIED' | 'RULE_INFERRED' | 'AI_INFERRED' | 'UNKNOWN' }>;
  cashImpactMinorUnits: number;
  customerName: string;
  invoiceNumber: string;
  blockerCategory: string;
  rootCause: string;
  responsibleArea: string;
  recommendedAction: string;
  invoiceId: string;
}

export interface CashUnblockSimulation {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  currentOutstandingMinorUnits: number;
  potentialUnblockedMinorUnits: number;
  scenarios: Array<{
    id: string;
    name: string;
    description: string;
    unblockedMinorUnits: number;
    actions: string[];
    confidence: number;
  }>;
  isSimulatedEstimate: true;
}

export interface CashTrapBucket {
  category: string;
  categoryTitle: string;
  count: number;
  totalMinorUnits: number;
  avgAgeDays: number;
}

export interface PaymentProbabilityEstimate {
  invoiceId: string;
  probability: number;
  expectedPaymentWindowDays: number;
  expectedPaymentDate: string;
  confidence: number;
  isAIOSparkEstimate: true;
  reasons: string[];
  riskLevel: 'WATCH' | 'AT_RISK' | 'HIGH_RISK' | 'CRITICAL';
}

export interface ActionOutcomeRecord {
  id: string;
  organizationId: string;
  invoiceId: string;
  recommendation: string;
  humanDecision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
  actionTaken: string;
  outcomeStatus: 'SUCCESS' | 'UNSUCCESSFUL' | 'PENDING_VERIFICATION';
  cashUnblockedMinorUnits: number;
  timestamp: string;
}

export class ActionOutcomeStore {
  private records: Map<string, ActionOutcomeRecord> = new Map();

  recordOutcome(data: Omit<ActionOutcomeRecord, 'id' | 'timestamp'>): ActionOutcomeRecord {
    const id = `outcome_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const record: ActionOutcomeRecord = {
      ...data,
      id,
      timestamp: new Date().toISOString(),
    };
    this.records.set(id, record);
    return record;
  }

  getOutcomes(orgId: string): ActionOutcomeRecord[] {
    return Array.from(this.records.values()).filter((r) => r.organizationId === orgId);
  }
}

export const actionOutcomeStore = new ActionOutcomeStore();

export function buildCausalChain(invoiceId: string, orgId: string): CausalChainSummary | null {
  udmStore.setTenantContext(orgId);
  const invoice = udmStore.getInvoices().find((i) => i.id === invoiceId);
  if (!invoice) return null;

  const customers = udmStore.getCustomers();
  const customer = customers.find((c) => c.id === invoice.customer_id);

  const exceptions = udmStore.getExceptions().filter((e) => e.invoice_id === invoiceId);
  const payments = udmStore.getPayments().filter((p) => p.customer_id === invoice.customer_id);

  const root: CausalGraphNode = {
    id: invoice.id,
    type: 'invoice',
    label: invoice.number,
    amount: invoice.amount_minor_units,
    amountMinorUnits: invoice.amount_minor_units,
    status: invoice.status,
    children: [],
    provenance: 'RULE_INFERRED',
    metadata: { source: 'UDM', recordType: 'invoice' },
  };

  if (customer) {
    root.children.push({
      id: customer.id,
      type: 'customer',
      label: customer.name,
      amount: customer.credit_limit_minor_units,
      amountMinorUnits: customer.credit_limit_minor_units,
      status: 'active',
      children: [],
      provenance: 'RULE_INFERRED',
      metadata: { source: 'UDM', recordType: 'customer' },
    });
  }

  exceptions.forEach((exc) => {
    root.children.push({
      id: exc.id,
      type: 'exception',
      label: exc.type,
      amount: undefined,
      status: exc.status,
      children: [],
      provenance: 'RULE_INFERRED',
      metadata: { source: 'UDM', recordType: 'exception', exceptionType: exc.type },
    });
  });

  payments.forEach((pay) => {
    root.children.push({
      id: pay.id,
      type: 'payment',
      label: pay.reference || pay.id,
      amount: pay.amount_minor_units,
      amountMinorUnits: pay.amount_minor_units,
      status: 'completed',
      children: [],
      provenance: 'RULE_INFERRED',
      metadata: { source: 'UDM', recordType: 'payment' },
    });
  });

  return {
    root,
    nodes: [root, ...root.children],
    edges: root.children.map((c) => ({
      from: root.id,
      to: c.id,
      label: 'related_to',
      provenance: 'RULE_INFERRED' as const,
    })),
    cashImpactMinorUnits: invoice.amount_minor_units,
    customerName: customer?.name || 'Unknown Customer',
    invoiceNumber: invoice.number,
    blockerCategory: exceptions.length > 0 ? exceptions[0].type : 'No Exception',
    rootCause: exceptions.length > 0 ? exceptions[0].type : 'No Exception',
    responsibleArea: 'Finance Executive',
    recommendedAction: exceptions.length > 0 ? exceptions[0].recommended_action || 'Review exception details' : 'No exceptions found',
    invoiceId: invoice.id,
  };
}

export function buildCausalGraph(invoiceId: string, orgId: string): CausalGraph | null {
  return buildCausalChain(invoiceId, orgId);
}

export function simulateCashUnblockScenario(
  orgId: string,
  scenarioId: string
): CashUnblockSimulation | null {
  udmStore.setTenantContext(orgId);
  const invoices = udmStore.getInvoices();
  const invoice = invoices.find((i) => i.id === scenarioId || i.number === scenarioId);
  if (!invoice) return null;

  const customers = udmStore.getCustomers();
  const customer = customers.find((c) => c.id === invoice.customer_id);

  const exceptions = udmStore.getExceptions().filter((e) => e.invoice_id === invoice.id);

  const scenarios: CashUnblockSimulation['scenarios'] = [];

  if (exceptions.length > 0) {
    scenarios.push({
      id: 'resolve_top_exception',
      name: 'Resolve top exception',
      description: `Resolve ${exceptions[0].type} exception blocking payment`,
      unblockedMinorUnits: invoice.amount_minor_units,
      actions: ['Review exception details', 'Contact customer or internal team', 'Update exception status'],
      confidence: 0.85,
    });
  }

  scenarios.push({
    id: 'send_payment_reminder',
    name: 'Send payment reminder',
    description: 'Send automated payment reminder to customer',
    unblockedMinorUnits: Math.round(invoice.amount_minor_units * 0.3),
    actions: ['Draft reminder email', 'Send to customer contact', 'Track response'],
    confidence: 0.6,
  });

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    customerName: customer?.name || 'Unknown Customer',
    currentOutstandingMinorUnits: invoice.amount_minor_units,
    potentialUnblockedMinorUnits: scenarios.reduce((sum, s) => sum + s.unblockedMinorUnits, 0),
    scenarios,
    isSimulatedEstimate: true,
  };
}

export function getCashTrapMap(orgId: string): CashTrapBucket[] {
  udmStore.setTenantContext(orgId);
  const invoices = udmStore.getInvoices();
  const exceptions = udmStore.getExceptions();

  const bucketMap = new Map<string, { count: number; totalMinorUnits: number; totalAgeDays: number }>();

  invoices.forEach((inv) => {
    if (inv.status === 'paid' || inv.status === 'written_off') return;

    const dueDate = new Date(inv.due_date).getTime();
    const now = Date.now();
    const ageDays = Math.max(0, Math.floor((now - dueDate) / 86400000));

    const exceptionsForInv = exceptions.filter((e) => e.invoice_id === inv.id);
    const category = exceptionsForInv.length > 0 ? exceptionsForInv[0].type : 'No Exception';

    const existing = bucketMap.get(category) || { count: 0, totalMinorUnits: 0, totalAgeDays: 0 };
    existing.count += 1;
    existing.totalMinorUnits += inv.amount_minor_units;
    existing.totalAgeDays += ageDays;
    bucketMap.set(category, existing);
  })

  const result: CashTrapBucket[] = [];
  bucketMap.forEach((data, category) => {
    result.push({
      category,
      categoryTitle: category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count: data.count,
      totalMinorUnits: data.totalMinorUnits,
      avgAgeDays: data.count > 0 ? Math.round(data.totalAgeDays / data.count) : 0,
    });
  });

  return result;
}

export function evaluatePaymentProbability(
  invoiceId: string,
  orgId: string,
  referenceDate?: string
): PaymentProbabilityEstimate {
  udmStore.setTenantContext(orgId);
  const invoice = udmStore.getInvoices().find((i) => i.id === invoiceId);
  if (!invoice) {
    return {
      invoiceId,
      probability: 0.5,
      expectedPaymentWindowDays: 30,
      expectedPaymentDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      confidence: 0.3,
      isAIOSparkEstimate: true,
      reasons: ['Insufficient historical data for reliable prediction'],
      riskLevel: 'WATCH',
    };
  }

  const exceptions = udmStore.getExceptions().filter((e) => e.invoice_id === invoiceId && e.status !== 'closed' && e.status !== 'verified');
  const disputes = udmStore.getDisputes().filter((d) => d.invoice_id === invoiceId && d.status !== 'resolved');

  let prob = 0.85;
  const reasons: string[] = [];
  let riskLevel: 'WATCH' | 'AT_RISK' | 'HIGH_RISK' | 'CRITICAL' = 'WATCH';

  if (disputes.length > 0) {
    prob -= 0.40;
    reasons.push('Active commercial dispute open');
    riskLevel = 'HIGH_RISK';
  }

  if (exceptions.length > 0) {
    prob -= 0.25;
    reasons.push(`Unresolved operational exception (${exceptions[0].type})`);
    if (riskLevel === 'WATCH') {
      riskLevel = 'AT_RISK';
    }
  }

  const dueDate = new Date(invoice.due_date).getTime();
  const now = referenceDate ? new Date(referenceDate).getTime() : Date.now();
  const daysOverdue = Math.max(0, Math.floor((now - dueDate) / 86400000));

  if (daysOverdue > 60) {
    prob -= 0.30;
    reasons.push(`Severely overdue by ${daysOverdue} days past credit terms`);
    riskLevel = 'CRITICAL';
  } else if (daysOverdue > 30) {
    prob -= 0.15;
    reasons.push(`Overdue by ${daysOverdue} days`);
    riskLevel = 'HIGH_RISK';
  }

  const finalProb = Math.max(0.05, Math.min(0.99, prob));
  const expectedDate = new Date(now + (daysOverdue > 0 ? 14 : 7) * 86400000).toISOString().split('T')[0];

  return {
    invoiceId: invoice.id,
    probability: Math.round(finalProb * 100) / 100,
    expectedPaymentWindowDays: daysOverdue > 0 ? 14 : 7,
    expectedPaymentDate: expectedDate,
    confidence: 0.88,
    isAIOSparkEstimate: true,
    reasons: reasons.length > 0 ? reasons : ['Payment tracking on schedule within standard credit terms'],
    riskLevel,
  };
}
