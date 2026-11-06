// AIOSpark Next-Best-Action Intelligence Engine (Step 07)
// Provides deterministic rule-first + AI-augmented Next-Best-Action evaluations across O2C cases.

import { udmStore } from '../udm/store';
import { promiseStore } from '../promises/store';
import { policyEngine } from '../agents/policy-engine';
import { AuditService } from '../audit/service';
import { buildCausalChain, CausalChainSummary } from './advanced-engine';

export type ActionabilityState = 
  | 'ACTIONABLE' 
  | 'WAITING_ON_CUSTOMER' 
  | 'WAITING_ON_INTERNAL_TEAM' 
  | 'WAITING_ON_APPROVAL' 
  | 'WAITING_ON_PAYMENT' 
  | 'BLOCKED_BY_DATA' 
  | 'NO_CLEAR_ACTION';

export type ActionCategory = 
  | 'INTERNAL' 
  | 'EXTERNAL' 
  | 'FINANCIAL' 
  | 'DATA' 
  | 'APPROVAL' 
  | 'RECONCILIATION';

export type ActionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RecommendationLifecycleState =
  | 'RECOMMENDED'
  | 'REVIEW_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_TO_EXECUTE'
  | 'EXECUTING'
  | 'WAITING_FOR_VERIFICATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED'
  | 'SUPERSEDED';

export interface ActionCandidate {
  id: string;
  actionType: string;
  actionLabel: string;
  category: ActionCategory;
  ownerTeam: 'Finance' | 'Procurement' | 'Operations' | 'Sales' | 'Customer AP' | 'Management';
  rationale: string;
  expectedEffect: string;
  risk: ActionRiskLevel;
  approvalRequired: boolean;
  isExecutable: boolean;
  score: number; // Transparent actionability score calculation
  whyNotPreferredReason?: string;
  prerequisites?: string[];
}

export interface NextBestActionRecommendation {
  caseId: string; // Invoice ID or Customer ID
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  cashAffectedMinorUnits: number;
  remainingExposureMinorUnits: number;
  blockerCategory: string;
  rootCause: string;
  rootCauseProvenance: 'VERIFIED' | 'AI_INFERRED' | 'UNKNOWN';
  dependency: string;
  actionabilityState: ActionabilityState;
  
  // Primary Recommendation
  actionType: string;
  actionLabel: string;
  category: ActionCategory;
  ownerTeam: string;
  rationale: string;
  evidence: Array<{ label: string; ref: string; source: string }>;
  expectedEffect: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  risk: ActionRiskLevel;
  approvalRequired: boolean;
  isExecutable: boolean; // false if action requires manual/external workflow
  
  // Alternatives & Context
  alternatives: ActionCandidate[];
  causalChainSummary?: CausalChainSummary | null;
  
  // Lifecycle & Metadata
  state: RecommendationLifecycleState;
  generatedAt: string;
  dataFreshnessTimestamp: string;
  expiresAt: string;
  isStale?: boolean;
}

export interface UserFeedbackRecord {
  recommendationId: string;
  invoiceId: string;
  userRole: string;
  organizationId?: string;
  actorUserId?: string;
  feedbackType: 'ACCEPT' | 'REJECT' | 'NOT_RELEVANT' | 'WRONG' | 'ALREADY_RESOLVED' | 'NEEDS_INVESTIGATION';
  reason?: string;
  timestamp: string;
}

// In-memory feedback log store for audit/analytics
const feedbackLogs: UserFeedbackRecord[] = [];

/**
 * Next-Best-Action Engine Core
 */
export class NextBestActionEngine {
  /**
   * Generates authoritative Next-Best-Action recommendation for a given invoice case.
   */
  public static evaluateCase(invoiceId: string, orgId: string, userRole: string = 'Finance Manager'): NextBestActionRecommendation | null {
    udmStore.setTenantContext(orgId);
    
    // 1. Fetch Authoritative Current O2C Data
    const invoice = udmStore.getInvoices().find(i => i.id === invoiceId);
    if (!invoice) return null;

    const customer = udmStore.getCustomers().find(c => c.id === invoice.customer_id);
    const customerName = customer ? customer.name : 'Unknown Customer';
    const exceptions = udmStore.getExceptions().filter(e => e.invoice_id === invoiceId && e.status !== 'closed' && e.status !== 'verified');
    const disputes = udmStore.getDisputes().filter(d => d.invoice_id === invoiceId && d.status !== 'resolved');
    const promises = promiseStore.getPromises(orgId).filter(p => p.invoice_id === invoiceId && p.status === 'pending');
    const matches = udmStore.getMatches().filter(m => m.invoice_id === invoiceId);
    const payments = udmStore.getPayments();
    
    const nowISO = new Date().toISOString();
    const todayStr = nowISO.split('T')[0];

    // 2. Derive Remaining Exposure
    // Outstanding amount takes into account allocated/partial payments from authoritative store
    const totalAllocatedMinorUnits = matches.reduce((sum, m) => sum + (m.matched_amount_minor_units || 0), 0);
    const remainingExposureMinorUnits = Math.max(0, invoice.amount_minor_units - totalAllocatedMinorUnits);
    const cashAffectedMinorUnits = remainingExposureMinorUnits > 0 ? remainingExposureMinorUnits : invoice.amount_minor_units;

    // 3. Build dynamic Causal Graph summary
    const causalChain = buildCausalChain(invoiceId, orgId);

    // 4. Evaluate Scenarios & Generate Action Candidates
    const candidates: ActionCandidate[] = [];
    let actionabilityState: ActionabilityState = 'ACTIONABLE';
    let primaryCandidate: ActionCandidate;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
    let confidenceReason = 'Authoritative UDM relationships verified';
    let rootCauseProvenance: 'VERIFIED' | 'AI_INFERRED' | 'UNKNOWN' = 'VERIFIED';
    let rootCauseText = 'Invoice awaiting payment processing';
    let blockerCategory = 'Standard Terms';
    let dependency = 'Customer AP';
    const evidenceList: Array<{ label: string; ref: string; source: string }> = [
      { label: `Invoice ${invoice.number}`, ref: invoice.id, source: 'ERP' },
    ];

    if (invoice.po_reference) {
      evidenceList.push({ label: `PO Reference ${invoice.po_reference}`, ref: invoice.po_reference, source: 'ERP' });
    }

    // SCENARIO CHECK 1: Fully Paid / Reconciled or 0 Balance Remaining
    if (invoice.status === 'paid' || remainingExposureMinorUnits === 0) {
      actionabilityState = 'NO_CLEAR_ACTION';
      primaryCandidate = {
        id: `act_no_action_${invoiceId}`,
        actionType: 'NO_ACTION',
        actionLabel: 'NO ACTION REQUIRED',
        category: 'RECONCILIATION',
        ownerTeam: 'Finance',
        rationale: 'Invoice is fully paid and reconciled in authoritative ledgers.',
        expectedEffect: 'No further action required.',
        risk: 'LOW',
        approvalRequired: false,
        isExecutable: false,
        score: 100,
      };
      rootCauseText = 'Invoice balance fully settled';
      blockerCategory = 'None';
      dependency = 'None';
    } 
    // SCENARIO CHECK 2: Payment Received but Unallocated / Reconciliation Discrepancy
    else if (matches.some(m => m.confidence && m.confidence > 0.5) || payments.some(p => p.source_id === invoice.number || p.reference === invoice.number)) {
      const matchingPayment = payments.find(p => p.source_id === invoice.number || p.reference === invoice.number);
      if (matchingPayment) {
        evidenceList.push({ label: `Payment Record ${matchingPayment.reference || matchingPayment.id}`, ref: matchingPayment.id, source: 'Bank Statement' });
      }
      
      actionabilityState = 'ACTIONABLE';
      blockerCategory = 'Unallocated Payment';
      rootCauseText = 'Payment received in bank ledger but missing invoice allocation matching.';
      dependency = 'Finance Reconciliation';
      
      primaryCandidate = {
        id: `act_reconcile_${invoiceId}`,
        actionType: 'MATCH_PAYMENT',
        actionLabel: 'REVIEW PAYMENT MATCH',
        category: 'RECONCILIATION',
        ownerTeam: 'Finance',
        rationale: 'Bank data indicates payment received for this account, but allocation requires matching verification.',
        expectedEffect: 'May clear outstanding balance without customer follow-up.',
        risk: 'LOW',
        approvalRequired: false,
        isExecutable: true,
        score: 95,
      };

      candidates.push({
        id: `act_investigate_${invoiceId}`,
        actionType: 'INVESTIGATE',
        actionLabel: 'INVESTIGATE INVOICE',
        category: 'DATA',
        ownerTeam: 'Finance',
        rationale: 'Deep dive bank deposit details before matching.',
        expectedEffect: 'Confirms exact bank line item provenance.',
        risk: 'LOW',
        approvalRequired: false,
        isExecutable: true,
        score: 60,
        whyNotPreferredReason: 'Matching recommendation has direct bank line item evidence.',
      });
    }
    // SCENARIO CHECK 3: Active Disputes Open (Commercial / Quality)
    else if (disputes.length > 0) {
      const disp = disputes[0];
      evidenceList.push({ label: `Dispute Record ${disp.id}`, ref: disp.id, source: 'CRM / Dispute Portal' });
      
      actionabilityState = 'WAITING_ON_INTERNAL_TEAM';
      blockerCategory = 'Customer Dispute';
      rootCauseText = `Commercial dispute flagged: ${disp.reason}`;
      dependency = 'Commercial / Sales';

      primaryCandidate = {
        id: `act_dispute_${invoiceId}`,
        actionType: 'RESOLVE_EXCEPTION',
        actionLabel: 'RESOLVE COMMERCIAL DISPUTE',
        category: 'INTERNAL',
        ownerTeam: 'Sales',
        rationale: 'Active dispute on pricing/quality blocks payment. Commercial resolution is required before collection.',
        expectedEffect: 'May clear buyer AP hold upon dispute resolution.',
        risk: 'MEDIUM',
        approvalRequired: false,
        isExecutable: true,
        score: 90,
      };

      candidates.push({
        id: `act_contact_cust_${invoiceId}`,
        actionType: 'FOLLOW_UP_WITH_CUSTOMER',
        actionLabel: 'CONTACT CUSTOMER',
        category: 'EXTERNAL',
        ownerTeam: 'Customer AP',
        rationale: 'Request updated status on dispute directly from buyer.',
        expectedEffect: 'Provides buyer AP perspective on dispute.',
        risk: 'MEDIUM',
        approvalRequired: true,
        isExecutable: true,
        score: 40,
        whyNotPreferredReason: 'Internal commercial team review must verify dispute grounds before customer outreach.',
      });
    }
    // SCENARIO CHECK 4: Operational Exception (PO Mismatch, Delivery Discrepancy, Tax Variance)
    else if (exceptions.length > 0) {
      const exc = exceptions[0];
      evidenceList.push({ label: `Exception ${exc.id} (${exc.type})`, ref: exc.id, source: 'UDM Exceptions' });

      blockerCategory = exc.type.replace(/_/g, ' ');
      rootCauseText = (exc.evidence as any)?.description || `Operational variance: ${exc.type}`;

      if (exc.type.includes('PO') || exc.type.includes('PURCHASE_ORDER')) {
        actionabilityState = 'WAITING_ON_INTERNAL_TEAM';
        dependency = 'Procurement';
        primaryCandidate = {
          id: `act_po_review_${invoiceId}`,
          actionType: 'REQUEST_INFORMATION',
          actionLabel: 'REQUEST PO REVIEW',
          category: 'INTERNAL',
          ownerTeam: 'Procurement',
          rationale: 'Invoice quantity/amount exceeds valid PO line item cap. Procurement review is required to update PO.',
          expectedEffect: 'May remove payment blocker by aligning PO balance with invoice.',
          risk: 'LOW',
          approvalRequired: false,
          isExecutable: true,
          score: 92,
        };
      } else if (exc.type.includes('DELIVERY') || exc.type.includes('GRN') || exc.type.includes('PROOF')) {
        actionabilityState = 'WAITING_ON_INTERNAL_TEAM';
        dependency = 'Operations';
        primaryCandidate = {
          id: `act_delivery_review_${invoiceId}`,
          actionType: 'REQUEST_DOCUMENT',
          actionLabel: 'REQUEST DELIVERY CONFIRMATION',
          category: 'INTERNAL',
          ownerTeam: 'Operations',
          rationale: 'Missing proof of delivery or GRN confirmation. Operations team must verify warehouse intake.',
          expectedEffect: 'Provides signed GRN evidence required for buyer AP release.',
          risk: 'LOW',
          approvalRequired: false,
          isExecutable: true,
          score: 88,
        };
      } else if (exc.type.includes('CREDIT') || exc.type.includes('TAX')) {
        actionabilityState = 'WAITING_ON_APPROVAL';
        dependency = 'Finance Manager';
        primaryCandidate = {
          id: `act_credit_review_${invoiceId}`,
          actionType: 'REQUEST_APPROVAL',
          actionLabel: 'REQUEST CREDIT ADJUSTMENT APPROVAL',
          category: 'FINANCIAL',
          ownerTeam: 'Management',
          rationale: 'Tax/credit discrepancy requires manager sign-off for credit note issuance.',
          expectedEffect: 'May issue authorized credit adjustment to settle balance variance.',
          risk: 'HIGH',
          approvalRequired: true,
          isExecutable: true,
          score: 85,
        };
      } else {
        actionabilityState = 'ACTIONABLE';
        dependency = 'Internal Finance';
        primaryCandidate = {
          id: `act_resolve_exc_${invoiceId}`,
          actionType: 'RESOLVE_EXCEPTION',
          actionLabel: 'RESOLVE OPERATIONAL EXCEPTION',
          category: 'INTERNAL',
          ownerTeam: 'Finance',
          rationale: `Resolve flagged exception (${exc.type}) through data reconciliation.`,
          expectedEffect: 'Removes operational exception flag.',
          risk: 'LOW',
          approvalRequired: false,
          isExecutable: true,
          score: 80,
        };
      }

      // Add "Contact Customer" as explicit NON-PREFERRED alternative when internal blocker exists
      candidates.push({
        id: `act_contact_alt_${invoiceId}`,
        actionType: 'FOLLOW_UP_WITH_CUSTOMER',
        actionLabel: 'CONTACT CUSTOMER FOR PAYMENT',
        category: 'EXTERNAL',
        ownerTeam: 'Customer AP',
        rationale: 'Directly chase buyer AP for payment.',
        expectedEffect: 'Informs customer of overdue status.',
        risk: 'MEDIUM',
        approvalRequired: true,
        isExecutable: true,
        score: 30,
        whyNotPreferredReason: `Internal blocker (${blockerCategory}) is currently active. Chasing customer before resolving internal dependency causes buyer friction.`,
      });
    }
    // SCENARIO CHECK 5: Payment Promise Active
    else if (promises.length > 0) {
      const promise = promises[0];
      const promiseDate = promise.expected_date;
      evidenceList.push({ label: `Payment Promise (${promiseDate})`, ref: promise.id, source: 'Collections' });
      
      if (promiseDate >= todayStr) {
        actionabilityState = 'WAITING_ON_CUSTOMER';
        blockerCategory = 'Payment Promise Pending';
        rootCauseText = `Customer promised payment for ${promiseDate}. Promise date is in the future or today.`;
        dependency = 'Customer AP';

        primaryCandidate = {
          id: `act_wait_promise_${invoiceId}`,
          actionType: 'NO_ACTION',
          actionLabel: 'WAIT UNTIL PROMISE DATE',
          category: 'EXTERNAL',
          ownerTeam: 'Customer AP',
          rationale: `Payment is promised for ${promiseDate}. Collection follow-up should be held until promise date expires.`,
          expectedEffect: 'Prevents customer fatigue and preserves commercial relationship.',
          risk: 'LOW',
          approvalRequired: false,
          isExecutable: false,
          score: 95,
        };
      } else {
        // Broken Promise
        actionabilityState = 'ACTIONABLE';
        blockerCategory = 'Broken Payment Promise';
        rootCauseText = `Payment promised for ${promiseDate} was not received.`;
        dependency = 'Customer AP';

        primaryCandidate = {
          id: `act_followup_promise_${invoiceId}`,
          actionType: 'FOLLOW_UP_ON_PAYMENT_PROMISE',
          actionLabel: 'FOLLOW UP ON BROKEN PROMISE',
          category: 'EXTERNAL',
          ownerTeam: 'Finance',
          rationale: `Promised payment date (${promiseDate}) has passed without bank receipt. Follow up specifically regarding broken promise commitment.`,
          expectedEffect: 'Re-establishes payment commitment or escalates overdue status.',
          risk: 'MEDIUM',
          approvalRequired: true,
          isExecutable: true,
          score: 92,
        };
      }
    }
    // SCENARIO CHECK 6: Clean Overdue / Customer Dependent Collection
    else if (invoice.due_date < todayStr && (invoice.status as string) !== 'paid') {
      actionabilityState = 'ACTIONABLE';
      blockerCategory = 'Overdue Receivable';
      rootCauseText = 'Invoice overdue past payment terms with no active internal blockers or disputes.';
      dependency = 'Customer AP';

      primaryCandidate = {
        id: `act_followup_cust_${invoiceId}`,
        actionType: 'FOLLOW_UP_WITH_CUSTOMER',
        actionLabel: 'FOLLOW UP WITH CUSTOMER',
        category: 'EXTERNAL',
        ownerTeam: 'Finance',
        rationale: `Invoice is overdue. Send formal payment reminder to buyer AP.`,
        expectedEffect: 'Prompts buyer AP payment scheduling.',
        risk: 'MEDIUM',
        approvalRequired: true,
        isExecutable: true,
        score: 85,
      };

      candidates.push({
        id: `act_review_cust_${invoiceId}`,
        actionType: 'REVIEW_CUSTOMER',
        actionLabel: 'REVIEW CUSTOMER CREDIT',
        category: 'INTERNAL',
        ownerTeam: 'Finance',
        rationale: 'Review overall customer payment trends before escalating collection.',
        expectedEffect: 'Evaluates account exposure risk.',
        risk: 'LOW',
        approvalRequired: false,
        isExecutable: true,
        score: 55,
        whyNotPreferredReason: 'Direct follow-up is standard next step for overdue unblocked invoice.',
      });
    }
    // SCENARIO CHECK 7: Unknown / Missing Evidence
    else {
      actionabilityState = 'BLOCKED_BY_DATA';
      blockerCategory = 'Unclassified Status';
      rootCauseText = 'Insufficient evidence available to determine underlying payment delay cause.';
      rootCauseProvenance = 'UNKNOWN';
      confidence = 'LOW';
      confidenceReason = 'Root cause cannot be verified deterministically from current ERP records.';
      dependency = 'Internal Finance';

      primaryCandidate = {
        id: `act_investigate_case_${invoiceId}`,
        actionType: 'INVESTIGATE',
        actionLabel: 'INVESTIGATE CASE DETAILS',
        category: 'DATA',
        ownerTeam: 'Finance',
        rationale: 'No active exception or dispute recorded, but payment is unfulfilled. Perform initial investigation.',
        expectedEffect: 'Uncovers root cause of payment delay.',
        risk: 'LOW',
        approvalRequired: false,
        isExecutable: true,
        score: 75,
      };

      candidates.push({
        id: `act_manual_step_${invoiceId}`,
        actionType: 'UPDATE_SOURCE_DATA',
        actionLabel: 'MANUAL ACTION REQUIRED',
        category: 'DATA',
        ownerTeam: 'Finance',
        rationale: 'Requires manual verification of customer ERP intake status.',
        expectedEffect: 'Updates source record accuracy.',
        risk: 'LOW',
        approvalRequired: false,
        isExecutable: false,
        score: 30,
        whyNotPreferredReason: 'Requires external manual verification.',
      });
    }

    // 5. Apply RBAC / Policy Filter
    let isUserAllowed = true;
    let approvalRequired = primaryCandidate.approvalRequired;
    if (primaryCandidate.isExecutable && primaryCandidate.actionType !== 'NO_ACTION') {
      const policyCheck = policyEngine.checkPolicy(orgId, 'NextBestActionEngine', primaryCandidate.actionType, {
        userRole,
        invoiceAmountMinorUnits: cashAffectedMinorUnits,
        confidence: confidence === 'HIGH' ? 0.9 : 0.6,
      });

      if (policyCheck.requiresApproval || policyEngine.isHighRiskAction(primaryCandidate.actionType)) {
        approvalRequired = true;
      }
      // A policy denial is authoritative for every role. Viewers are not the
      // only role that can be blocked: subscription, rate-limit, missing-rule,
      // and action allow-list failures must also make the recommendation
      // non-executable.
      if (!policyCheck.allowed) {
        isUserAllowed = false;
      }
    }

    // 6. Formulate Final Recommendation Object
    const recommendation: NextBestActionRecommendation = {
      caseId: invoice.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      customerName,
      cashAffectedMinorUnits,
      remainingExposureMinorUnits,
      blockerCategory,
      rootCause: rootCauseText,
      rootCauseProvenance,
      dependency,
      actionabilityState,

      actionType: primaryCandidate.actionType,
      actionLabel: primaryCandidate.actionLabel,
      category: primaryCandidate.category,
      ownerTeam: primaryCandidate.ownerTeam,
      rationale: primaryCandidate.rationale,
      evidence: evidenceList,
      expectedEffect: primaryCandidate.expectedEffect,
      confidence,
      confidenceReason,
      risk: primaryCandidate.risk,
      approvalRequired,
      isExecutable: primaryCandidate.isExecutable && isUserAllowed,

      alternatives: candidates,
      causalChainSummary: causalChain,

      state: approvalRequired ? 'APPROVAL_REQUIRED' : (primaryCandidate.isExecutable && isUserAllowed ? 'READY_TO_EXECUTE' : 'RECOMMENDED'),
      generatedAt: nowISO,
      // Use the authoritative record version timestamp, not recommendation
      // generation time, so a fresh recalculation remains comparable.
      dataFreshnessTimestamp: invoice.updated_at,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour TTL
      isStale: false,
    };

    return recommendation;
  }

  /**
   * Re-check authoritative state right before execution to prevent stale actions or duplicate triggers.
   */
  public static verifyFreshnessAndState(invoiceId: string, orgId: string, expectedStateTimestamp?: string): { isValid: boolean; currentRecommendation?: NextBestActionRecommendation | null; reason?: string } {
    udmStore.setTenantContext(orgId);
    const invoice = udmStore.getInvoices().find(i => i.id === invoiceId);
    if (!invoice) {
      return { isValid: false, reason: 'Invoice record no longer exists in UDM store.' };
    }

    if (invoice.status === 'paid') {
      return { isValid: false, reason: 'Case state changed: Invoice has been marked paid since recommendation generation.' };
    }

    const currentRec = this.evaluateCase(invoiceId, orgId);
    if (!currentRec) {
      return { isValid: false, reason: 'Unable to recalculate case recommendation.' };
    }

    if (expectedStateTimestamp && currentRec.dataFreshnessTimestamp !== expectedStateTimestamp) {
      return {
        isValid: false,
        currentRecommendation: currentRec,
        reason: 'Recommendation is stale: the authoritative invoice state changed after it was generated.',
      };
    }

    return { isValid: true, currentRecommendation: currentRec };
  }

  /**
   * Log User Feedback on Recommendation
   */
  public static recordFeedback(record: Omit<UserFeedbackRecord, 'timestamp'>): UserFeedbackRecord {
    const fullRecord: UserFeedbackRecord = {
      ...record,
      timestamp: new Date().toISOString(),
    };
    feedbackLogs.push(fullRecord);
    if (record.organizationId && record.actorUserId) {
      AuditService.record({
        organization_id: record.organizationId,
        actor_user_id: record.actorUserId,
        actor_type: 'user',
        action_type: 'record_nba_feedback',
        subject_type: 'NextBestActionRecommendation',
        subject_id: record.recommendationId,
        after_state: { feedbackType: record.feedbackType, reason: record.reason, invoiceId: record.invoiceId },
        result: 'success',
      });
    }
    return fullRecord;
  }

  /**
   * Fetch feedback logs for auditing
   */
  public static getFeedbackLogs(): UserFeedbackRecord[] {
    return [...feedbackLogs];
  }
}
