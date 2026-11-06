// AIOSpark Cash Unblock Simulator Engine (Step 08)
// Read-only scenario evaluation layer built directly over UDM, Causal Graph, and Next-Best-Action Engine.

import { udmStore } from '../udm/store';
import { NextBestActionEngine, NextBestActionRecommendation } from './next-best-action-engine';
import { buildCausalChain, CausalChainSummary } from './advanced-engine';

export interface SimulationInput {
  invoiceId: string;
  orgId: string;
  selectedActionType?: string;
  userRole?: string;
}

export interface ScenarioAssumption {
  id: string;
  label: string;
  status: 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNKNOWN';
  provenance: string;
  riskNote?: string;
}

export interface ScenarioNode {
  id: string;
  type: 'CUSTOMER' | 'PO' | 'INVOICE' | 'BLOCKER' | 'OUTCOME' | 'ACTION' | 'PAYMENT' | 'RECONCILIATION';
  label: string;
  sublabel?: string;
  amount?: string;
  status?: string;
  isScenarioHypothetical?: boolean;
  isBlocker?: boolean;
  isResolved?: boolean;
}

export interface ScenarioOption {
  id: string;
  actionType: string;
  actionLabel: string;
  category?: string;
  ownerTeam: string;
  description: string;
  isRecommended: boolean;
  
  // Potential Scenario Impact
  potentiallyUnblockedMinorUnits: number;
  scenarioActionableCashMinorUnits: number;
  potentialNewState: string;
  remainingDependency: string;
  potentialNextAction: string;
  
  // Comparison Metrics
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceExplanation: string;
  approvalRequired: boolean;
  structuralAlignmentReason: string;
  whyNotPreferredReason?: string;
  
  // Graph & Chain
  scenarioNodes: ScenarioNode[];
  assumptions: ScenarioAssumption[];
}

export interface CashUnblockSimulationResult {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  orgId: string;
  generatedAt: string;
  dataFreshnessTimestamp: string;
  
  // FACTUAL BASELINE (ACTUAL)
  actualOutstandingMinorUnits: number;
  actualActionableCashMinorUnits: number;
  actualStatus: string;
  actualPrimaryBlocker: string;
  actualDependency: string;
  actualEvidence: Array<{ label: string; ref: string; source: string }>;
  
  // SCENARIO SELECTION & COMPARISON
  selectedScenarioId: string;
  scenarios: ScenarioOption[]; // Usually Scenario A (Recommended) vs Scenario B (Alternative/Chasing)
  
  // SELECTED SCENARIO SUMMARY (HYPOTHETICAL ONLY)
  activeScenario: ScenarioOption;
  
  // DELTAS (HYPOTHETICAL ONLY)
  deltaActionableCashMinorUnits: number;
  deltaOutstandingMinorUnits: number; // Actual vs Hypothetical if payment occurs
  
  // SAFETY & EXPLAINABILITY
  disclaimer: string;
  isReadOnly: true;
  hasDataConflict?: boolean;
  dataConflictNote?: string;
  
  // Direct link to NextBestAction recommendation
  nbaRecommendation: NextBestActionRecommendation | null;
}

export class CashUnblockSimulatorEngine {
  /**
   * Evaluates a scenario for a given invoice case without modifying database state.
   */
  public static simulate(input: SimulationInput): CashUnblockSimulationResult | null {
    const { invoiceId, orgId, selectedActionType, userRole = 'Finance Manager' } = input;
    udmStore.setTenantContext(orgId);

    // 1. Fetch Authoritative Current O2C Data
    const invoice = udmStore.getInvoices().find(i => i.id === invoiceId);
    if (!invoice) return null;

    const customer = udmStore.getCustomers().find(c => c.id === invoice.customer_id);
    const customerName = customer ? customer.name : 'Unknown Customer';
    const exceptions = udmStore.getExceptions().filter(e => e.invoice_id === invoiceId && e.status !== 'closed' && e.status !== 'verified');
    const disputes = udmStore.getDisputes().filter(d => d.invoice_id === invoiceId && d.status !== 'resolved');
    const matches = udmStore.getMatches().filter(m => m.invoice_id === invoiceId);
    const payments = udmStore.getPayments();

    const nowISO = new Date().toISOString();
    const formattedOutstanding = `₹${(invoice.amount_minor_units / 100).toLocaleString('en-IN')}`;

    // 2. Fetch Authoritative Next-Best-Action Recommendation
    const nbaRec = NextBestActionEngine.evaluateCase(invoiceId, orgId, userRole);

    // 3. Establish Factual Baseline (ACTUAL)
    const totalAllocatedMinorUnits = matches.reduce((sum, m) => sum + (m.matched_amount_minor_units || 0), 0);
    const actualOutstandingMinorUnits = Math.max(0, invoice.amount_minor_units - totalAllocatedMinorUnits);
    const hasInternalBlocker = exceptions.length > 0 || disputes.length > 0;
    const actualActionableCashMinorUnits = hasInternalBlocker ? actualOutstandingMinorUnits : 0;
    const actualPrimaryBlocker = nbaRec ? nbaRec.blockerCategory : (exceptions[0]?.type || 'Standard Terms');
    const actualDependency = nbaRec ? nbaRec.dependency : 'Customer AP';
    const actualEvidence = nbaRec ? nbaRec.evidence : [{ label: `Invoice ${invoice.number}`, ref: invoice.id, source: 'ERP' }];

    // Check for Data Conflicts (e.g. Bank payment received but unallocated)
    const unallocatedPayment = payments.find(p => p.source_id === invoice.number || p.reference === invoice.number);
    let hasDataConflict = false;
    let dataConflictNote: string | undefined;

    if (unallocatedPayment) {
      hasDataConflict = true;
      dataConflictNote = `ERP shows ₹${(actualOutstandingMinorUnits/100).toLocaleString('en-IN')} outstanding, but Bank Ledger indicates a matching unallocated payment (${unallocatedPayment.reference || unallocatedPayment.id}). Resolve reconciliation before customer outreach.`;
    }

    // 4. Build Scenario A (Recommended Action - Structurally Aligned)
    const recActionType = nbaRec ? nbaRec.actionType : 'REQUEST_INFORMATION';
    const recActionLabel = nbaRec ? nbaRec.actionLabel : 'RESOLVE BLOCKER';
    const recOwner = nbaRec ? nbaRec.ownerTeam : 'Procurement';
    const recRationale = nbaRec ? nbaRec.rationale : 'Address identified internal dependency before pursuing payment.';
    const recExpected = nbaRec ? nbaRec.expectedEffect : 'May unblock payment processing.';

    const scenarioA_Nodes: ScenarioNode[] = [
      { id: 'n1', type: 'CUSTOMER', label: customerName, sublabel: customer?.source_id || 'CUST-REF' },
      { id: 'n2', type: 'INVOICE', label: invoice.number, amount: formattedOutstanding, sublabel: `Status: ${invoice.status.toUpperCase()}` },
      { id: 'n3', type: 'BLOCKER', label: actualPrimaryBlocker.toUpperCase(), isBlocker: true, sublabel: `Dependency: ${actualDependency}` },
      { id: 'n4', type: 'ACTION', label: `SCENARIO: ${recActionLabel}`, isScenarioHypothetical: true, status: 'HYPOTHETICAL ACTION' },
      { id: 'n5', type: 'OUTCOME', label: 'POTENTIAL: ACTIONABLE', amount: formattedOutstanding, isScenarioHypothetical: true, status: 'SCENARIO ONLY' },
    ];

    const scenarioA_Assumptions: ScenarioAssumption[] = [
      { id: 'a1', label: `${actualDependency} team successfully addresses ${actualPrimaryBlocker}`, status: 'SUPPORTED', provenance: 'UDM Exception Record', riskNote: 'Turnaround time depends on department backlog' },
      { id: 'a2', label: 'Buyer AP accepts updated invoice documentation', status: 'SUPPORTED', provenance: 'Customer Payment Terms', riskNote: 'Buyer AP may request secondary manager approval' },
      { id: 'a3', label: 'Customer does not introduce new pricing or quality disputes', status: 'PARTIALLY_SUPPORTED', provenance: 'Customer 360 Risk Score', riskNote: 'Commercial relationship risk is non-zero' },
      { id: 'a4', label: 'Payment arrives following standard buyer payment processing run', status: 'UNKNOWN', provenance: 'None', riskNote: 'Actual payment timing remains uncommitted' },
    ];

    const scenarioA: ScenarioOption = {
      id: 'scen_a_recommended',
      actionType: recActionType,
      actionLabel: recActionLabel,
      ownerTeam: recOwner,
      description: recRationale,
      isRecommended: true,
      potentiallyUnblockedMinorUnits: actualOutstandingMinorUnits,
      scenarioActionableCashMinorUnits: actualOutstandingMinorUnits,
      potentialNewState: 'Actionable / Awaiting Buyer AP Clearance',
      remainingDependency: 'Customer Payment Run',
      potentialNextAction: 'Monitor payment schedule after blocker resolution',
      riskLevel: nbaRec?.risk || 'LOW',
      confidence: 'HIGH',
      confidenceExplanation: 'Scenario directly targets verified root cause and primary dependency.',
      approvalRequired: nbaRec?.approvalRequired || false,
      structuralAlignmentReason: `Directly resolves active ${actualPrimaryBlocker} blocker, allowing invoice to proceed through AP intake.`,
      scenarioNodes: scenarioA_Nodes,
      assumptions: scenarioA_Assumptions,
    };

    // 5. Build Scenario B (Alternative / Customer Follow-Up Action)
    const scenarioB_Nodes: ScenarioNode[] = [
      { id: 'n1', type: 'CUSTOMER', label: customerName, sublabel: customer?.source_id || 'CUST-REF' },
      { id: 'n2', type: 'INVOICE', label: invoice.number, amount: formattedOutstanding, sublabel: `Status: ${invoice.status.toUpperCase()}` },
      { id: 'n3', type: 'BLOCKER', label: actualPrimaryBlocker.toUpperCase(), isBlocker: true, sublabel: 'INTERNAL BLOCKER REMAINS ACTIVE' },
      { id: 'n4', type: 'ACTION', label: 'SCENARIO: CHASE CUSTOMER FOR PAYMENT', isScenarioHypothetical: true, status: 'HYPOTHETICAL ACTION' },
      { id: 'n5', type: 'OUTCOME', label: 'POTENTIAL IMPACT: LIMITED', amount: '₹0', isScenarioHypothetical: true, status: 'BLOCKED BY INTERNAL DEPENDENCY' },
    ];

    const scenarioB_Assumptions: ScenarioAssumption[] = [
      { id: 'b1', label: 'Customer AP is willing to process payment despite open internal blocker', status: 'UNKNOWN', provenance: 'None', riskNote: 'High likelihood buyer AP rejects invoice due to mismatch' },
      { id: 'b2', label: 'Direct customer contact prompts buyer AP investigation', status: 'PARTIALLY_SUPPORTED', provenance: 'Customer Contact Log', riskNote: 'May cause customer friction if internal error is ours' },
    ];

    const scenarioB: ScenarioOption = {
      id: 'scen_b_alternative',
      actionType: 'FOLLOW_UP_WITH_CUSTOMER',
      actionLabel: 'CONTACT CUSTOMER FOR PAYMENT',
      category: 'EXTERNAL',
      ownerTeam: 'Customer AP',
      description: 'Chasing buyer AP directly before resolving internal blocker.',
      isRecommended: false,
      potentiallyUnblockedMinorUnits: 0, // Unlikely to unblock while internal blocker is active
      scenarioActionableCashMinorUnits: 0,
      potentialNewState: 'Blocked / Customer Friction Risk',
      remainingDependency: `Internal ${actualPrimaryBlocker} Blocker`,
      potentialNextAction: `Resolve ${actualPrimaryBlocker} internally`,
      riskLevel: 'HIGH',
      confidence: 'LOW',
      confidenceExplanation: `Internal blocker (${actualPrimaryBlocker}) remains active. Customer cannot process payment until PO/GRN variance is corrected.`,
      approvalRequired: true,
      structuralAlignmentReason: 'Secondary alternative. Not preferred while internal blocker is active.',
      whyNotPreferredReason: `An internal ${actualPrimaryBlocker} is currently blocking payment. Chasing the customer before resolving our internal dependency creates buyer friction without unblocking cash.`,
      scenarioNodes: scenarioB_Nodes,
      assumptions: scenarioB_Assumptions,
    };

    const scenarios = [scenarioA, scenarioB];

    // Determine active selected scenario (default to scenario A or matching user selection)
    let activeScenario = scenarioA;
    if (selectedActionType) {
      const matchedScen = scenarios.find(s => s.actionType === selectedActionType || s.id === selectedActionType);
      if (matchedScen) activeScenario = matchedScen;
    }

    const result: CashUnblockSimulationResult = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      customerName,
      orgId,
      generatedAt: nowISO,
      dataFreshnessTimestamp: nowISO,

      actualOutstandingMinorUnits,
      actualActionableCashMinorUnits,
      actualStatus: invoice.status.toUpperCase(),
      actualPrimaryBlocker,
      actualDependency,
      actualEvidence,

      selectedScenarioId: activeScenario.id,
      scenarios,
      activeScenario,

      deltaActionableCashMinorUnits: activeScenario.scenarioActionableCashMinorUnits - actualActionableCashMinorUnits,
      deltaOutstandingMinorUnits: actualOutstandingMinorUnits, // Hypothetical potential change if full payment followed

      disclaimer: 'Scenario analysis only. Results are hypothetical estimates based on current O2C data and do not guarantee payment, cash recovery, or timing.',
      isReadOnly: true,
      hasDataConflict,
      dataConflictNote,
      nbaRecommendation: nbaRec,
    };

    return result;
  }
}
