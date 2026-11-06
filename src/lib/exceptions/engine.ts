// AIOSpark Exception Engine Core State Machine & Severity Rules (Layer 15)

import { udmStore } from '../udm/store';
import { ExceptionRecord, ExceptionSeverity, ExceptionStatus, Invoice, Customer } from '../udm/types';
import { AIAnalysis } from '../intelligence/ai-analysis-contract';
import { PaymentDelayCategory } from '../taxonomy/definitions';

export interface OrgExceptionSettings {
  organizationId: string;
  criticalAmountThresholdMinorUnits: number; // e.g. ₹5,00,000.00 = 50000000 paise
  criticalDaysOverdueThreshold: number; // e.g. 60 days
  highAmountThresholdMinorUnits: number; // e.g. ₹1,00,000.00 = 10000000 paise
  highDaysOverdueThreshold: number; // e.g. 30 days
  mediumDaysOverdueThreshold: number; // e.g. 15 days
  categoryRoleMappings: Record<string, string>; // Maps category -> Role string
}

export const DEFAULT_ORG_SETTINGS: OrgExceptionSettings = {
  organizationId: 'default',
  criticalAmountThresholdMinorUnits: 50000000, // ₹5,00,000.00
  criticalDaysOverdueThreshold: 60,
  highAmountThresholdMinorUnits: 10000000, // ₹1,00,000.00
  highDaysOverdueThreshold: 30,
  mediumDaysOverdueThreshold: 15,
  categoryRoleMappings: {
    CUSTOMER_DISPUTE: 'Finance Manager',
    PO_MISMATCH: 'Finance Executive',
    GST_TAX_ISSUE: 'Finance Executive',
    CREDIT_ISSUE: 'Finance Manager',
  },
};

// EXPLICIT STATE MACHINE TRANSITION MATRIX
const VALID_TRANSITIONS: Record<ExceptionStatus, ExceptionStatus[]> = {
  detected: ['classified', 'closed'],
  classified: ['severity_determined', 'closed'],
  severity_determined: ['owner_assigned', 'closed'],
  owner_assigned: ['recommended', 'closed'],
  recommended: ['pending_approval', 'closed'],
  pending_approval: ['approved', 'rejected', 'closed'],
  approved: ['executed', 'closed'],
  executed: ['verified', 'closed'],
  verified: ['closed'],
  rejected: ['closed'],
  closed: [],
};

class ExceptionEngine {
  private orgSettings: Map<string, OrgExceptionSettings> = new Map();

  public setOrgSettings(settings: OrgExceptionSettings): void {
    this.orgSettings.set(settings.organizationId, settings);
  }

  public getOrgSettings(orgId: string): OrgExceptionSettings {
    return this.orgSettings.get(orgId) || { ...DEFAULT_ORG_SETTINGS, organizationId: orgId };
  }

  /**
   * 1. VALIDATED STATE MACHINE TRANSITION FUNCTION
   */
  public transitionException(exceptionId: string, toStatus: ExceptionStatus, orgId: string): ExceptionRecord {
    udmStore.setTenantContext(orgId);
    const exceptions = udmStore.getExceptions();
    const exc = exceptions.find((e) => e.id === exceptionId);

    if (!exc) {
      throw new Error(`Exception not found: ${exceptionId}`);
    }

    const allowedNextStates = VALID_TRANSITIONS[exc.status] || [];
    if (!allowedNextStates.includes(toStatus)) {
      throw new Error(
        `Invalid Exception State Machine Transition: Cannot move from '${exc.status}' directly to '${toStatus}'. Allowed transitions: [${allowedNextStates.join(', ')}]`
      );
    }

    return udmStore.updateException(exceptionId, { status: toStatus });
  }

  /**
   * 2. DETERMINISTIC SEVERITY DETERMINATION RULES
   */
  public calculateSeverity(
    invoice: Invoice | null,
    category: PaymentDelayCategory,
    orgId: string,
    todayStr?: string
  ): ExceptionSeverity {
    if (!invoice) return 'low';

    const settings = this.getOrgSettings(orgId);
    const today = todayStr || new Date().toISOString().split('T')[0];
    const todayMs = new Date(today).getTime();
    const dueMs = new Date(invoice.due_date).getTime();
    const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24)));

    // Rule 1: CRITICAL
    const isCriticalCategory = ['CUSTOMER_DISPUTE', 'CREDIT_ISSUE'].includes(category);
    if (
      invoice.amount_minor_units >= settings.criticalAmountThresholdMinorUnits &&
      daysOverdue >= settings.criticalDaysOverdueThreshold &&
      isCriticalCategory
    ) {
      return 'critical';
    }

    // Rule 2: HIGH
    if (
      invoice.amount_minor_units >= settings.highAmountThresholdMinorUnits &&
      daysOverdue >= settings.highDaysOverdueThreshold
    ) {
      return 'high';
    }

    // Rule 3: MEDIUM
    if (daysOverdue >= settings.mediumDaysOverdueThreshold) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 3. RULE-BASED OWNER ASSIGNMENT
   */
  public determineOwner(
    customer: Customer | null,
    category: PaymentDelayCategory,
    orgId: string
  ): string | null {
    // 1. Customer assigned owner takes priority
    if (customer && customer.owner_user_id) {
      return customer.owner_user_id;
    }

    // 2. Fall back to Category-to-Role mapping
    const settings = this.getOrgSettings(orgId);
    const targetRole = settings.categoryRoleMappings[category];
    if (targetRole) {
      // Return representative assigned role ID or null if unassigned
      return `role_assigned_${targetRole.toLowerCase().replace(/\s+/g, '_')}`;
    }

    // 3. Surface as Unassigned (null)
    return null;
  }

  /**
   * 4. AUTOMATIC EXCEPTION TRIGGER & DUPLICATE PREVENTION
   */
  public handleAIAnalysisTrigger(
    invoiceId: string,
    analysis: AIAnalysis,
    orgId: string,
    todayStr?: string
  ): ExceptionRecord | null {
    udmStore.setTenantContext(orgId);
    const invoices = udmStore.getInvoices();
    const invoice = invoices.find((i) => i.id === invoiceId) || null;

    const customers = udmStore.getCustomers();
    const customer = invoice ? customers.find((c) => c.id === invoice.customer_id) || null : null;

    const category = analysis.category as PaymentDelayCategory;

    // Skip normal cycle unless confidence is low or quality issue
    if (category === 'NORMAL_CYCLE' && analysis.confidence >= 0.6) {
      return null;
    }

    // Check duplicate prevention: Update existing non-closed exception if present
    const existingExceptions = udmStore.getExceptions();
    const activeExc = existingExceptions.find(
      (e) => e.invoice_id === invoiceId && !['closed', 'rejected'].includes(e.status)
    );

    const severity = this.calculateSeverity(invoice, category, orgId, todayStr);
    const ownerUserId = this.determineOwner(customer, category, orgId);

    if (activeExc) {
      // Update existing record
      return udmStore.updateException(activeExc.id, {
        severity,
        owner_user_id: ownerUserId,
        evidence: { evidenceItems: analysis.evidence, confidence: analysis.confidence },
        recommended_action: analysis.conclusion,
      });
    }

    // Create new Exception starting at 'classified'
    const newExc = udmStore.insertException({
      organization_id: orgId,
      customer_id: customer ? customer.id : null,
      invoice_id: invoiceId,
      type: category,
      severity,
      owner_user_id: ownerUserId,
      evidence: { evidenceItems: analysis.evidence, confidence: analysis.confidence },
      recommended_action: analysis.conclusion,
      status: 'classified',
    });

    // Single step: classified → severity_determined.
    // Each subsequent transition (owner_assigned → recommended → pending_approval)
    // is triggered individually by the responsible actor/system, keeping every
    // state change auditable and preventing blind cascading.
    this.transitionException(newExc.id, 'severity_determined', orgId);

    // Trigger Investigation Agent (Layer 16) asynchronously to gather evidence
    // before owner assignment and recommendation transitions occur.
    import('../agents/investigation-agent').then(({ runInvestigationAgent }) => {
      return runInvestigationAgent({ invoiceId, organizationId: orgId });
    }).catch((error) => {
      console.error('[ExceptionEngine] Investigation agent failed', {
        organizationId: orgId,
        invoiceId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return newExc;
  }
}

export const exceptionEngine = new ExceptionEngine();
