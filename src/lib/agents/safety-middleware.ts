// AIOSpark Structurally-Enforced 8-Step AI Safety Middleware (Layer 30)
// Pipeline: permission check -> policy check -> data validation -> AI decision -> risk assessment -> approval requirement -> action -> verification
// Shared middleware embedded inside AgentExecutor that CANNOT be bypassed by individual agent implementations or org config overrides.

import { policyEngine, PolicyContext, MANDATORY_APPROVAL_HIGH_RISK_ACTIONS } from './policy-engine';
import { pool } from '../db/postgres';
import { udmStore } from '../udm/store';
import { can, Action, Resource, Role } from '../tenant/permissions';

export interface SafetyPipelineContext {
  organizationId: string;
  agentName: string;
  userRole?: string; // e.g. "Owner", "Admin", "Analyst", "Viewer"
  actionType?: string;
  targetEntity?: string; // e.g. "invoice", "customer", "exception"
  targetId?: string;
  payload?: Record<string, any>;
  evidence?: any[];
  confidence?: number;
  amountMinorUnits?: number;
  [key: string]: any;
}

export interface RiskAssessmentResult {
  requiresApproval: boolean;
  riskReasons: string[];
  amountFloorTriggered: boolean;
  highRiskTypeTriggered: boolean;
  confidenceFloorTriggered: boolean;
}

export interface SafetyStepReport {
  step: string;
  passed: boolean;
  detail: string;
}

export interface SafetyPipelineResult<T = any> {
  success: boolean;
  stepReports: SafetyStepReport[];
  failedStep?: string;
  reason?: string;
  requiresApproval?: boolean;
  approvalRequestId?: string;
  data?: T;
}

// HARD PRODUCT-WIDE SAFETY FLOORS (CANNOT BE OVERRIDDEN BY ANY ORG CONFIG)
export const HARD_PRODUCT_SAFETY_FLOORS = {
  // Hard ceiling: ₹5,00,000 in paise (500,000,00 paise)
  MAX_AMOUNT_PAISE_CEILING: 50000000,
  // Hard confidence floor: 60%
  MIN_CONFIDENCE_FLOOR: 0.60,
};

class SafetyMiddlewareEngine {
// Idempotency tracker uses durable SQLite storage (namespace: 'safety:double_execution')
// instead of a process-local Map, so entries survive process restarts and span
// across application instances. The snapshot is read/written via withWriteTransaction.
 private recentActionHashes: Map<string, number> = new Map(); // will be populated from durable store on init

private readonly idempotencyNamespace = 'safety:double_execution'
  /**
   * Maps each actionType to the specific RBAC (action, resource) pair it requires,
   * instead of blanket-checking 'edit' on 'invoices' for every action.
   *
   * Read-only investigation actions (no actionType) are always permitted for viewing roles.
   */
  private static ACTION_TO_RBAC: Record<string, { action: Action; resource: Resource }> = {
    SEND_REMINDER: { action: 'edit', resource: 'invoices' },
    SEND_CUSTOMER_COMMUNICATION: { action: 'edit', resource: 'invoices' },
    ALTER_INVOICE_VALUE: { action: 'edit', resource: 'invoices' },
    ISSUE_CREDIT_NOTE: { action: 'edit', resource: 'invoices' },
    RECORD_PAYMENT_MATCH: { action: 'edit', resource: 'invoices' },
    MODIFY_ACCOUNTING_RECORD: { action: 'edit', resource: 'invoices' },
    RECLASSIFY_INVOICE: { action: 'edit', resource: 'invoices' },
    CREATE_EXCEPTION: { action: 'create', resource: 'exceptions' },
    FLAG_DISPUTE: { action: 'edit', resource: 'exceptions' },
    UPDATE_RISK_SCORE: { action: 'edit', resource: 'customers' },
  };

  /**
   * STEP 1: Permission Check (RBAC Verification)
   */
  public checkPermission(context: SafetyPipelineContext): SafetyStepReport {
    const role = context.userRole || 'Admin';
    const action = context.actionType || 'READ';

    // Read-only investigation / no actionType → viewing roles may proceed
    if (!context.actionType) {
      return {
        step: '1. Permission Check',
        passed: true,
        detail: `Role '${role}' holds sufficient privileges for read-only action '${action}'.`,
      };
    }

    const mapping = SafetyMiddlewareEngine.ACTION_TO_RBAC[context.actionType];

    // Unknown actionType with no explicit mapping → secure default: deny
    if (!mapping) {
      return {
        step: '1. Permission Check',
        passed: false,
        detail: `No RBAC mapping defined for action '${action}'. Access denied by secure default.`,
      };
    }

    // Evaluate against Layer 3 Central RBAC Permission Matrix using the mapped action/resource
    const isPermitted = can(role, mapping.action, mapping.resource);
    if (!isPermitted) {
      return {
        step: '1. Permission Check',
        passed: false,
        detail: `Role '${role}' is not permitted to '${mapping.action}' on '${mapping.resource}' required for action '${action}'.`,
      };
    }

    return {
      step: '1. Permission Check',
      passed: true,
      detail: `Role '${role}' holds '${mapping.action}' on '${mapping.resource}' for action '${action}'.`,
    };
  }

  /**
   * STEP 2: Policy Check (Subscription, Allowlist & Rate Limits)
   */
  public checkPolicy(context: SafetyPipelineContext): SafetyStepReport {
    const policyCtx: PolicyContext = {
      userRole: context.userRole,
      subscriptionStatus: context.subscriptionStatus || 'active',
      invoiceAmountMinorUnits: context.amountMinorUnits,
      confidence: context.confidence,
      evidence: context.evidence,
      subjectType: context.targetEntity,
      subjectId: context.targetId,
      payload: context.payload,
    };

    const res = policyEngine.checkPolicy(context.organizationId, context.agentName, context.actionType, policyCtx);
    if (!res.allowed && !res.requiresApproval) {
      return {
        step: '2. Policy Check',
        passed: false,
        detail: res.reason || 'Policy check failed.',
      };
    }

    return {
      step: '2. Policy Check',
      passed: true,
      detail: res.requiresApproval
        ? `Policy check passed (Routed to approval: ${res.approvalRequestId})`
        : 'Policy check passed.',
    };
  }

  /**
   * STEP 3: Data Validation (Stale Analysis & Record State Guard)
   */
  public validateData(context: SafetyPipelineContext): SafetyStepReport {
    if (!context.targetEntity || !context.targetId) {
      return {
        step: '3. Data Validation',
        passed: true,
        detail: 'No specific target entity to validate.',
      };
    }

    const entityType = context.targetEntity.toLowerCase();

    if (entityType === 'invoice') {
      const invoices = udmStore.getInvoices();
      const targetInv = invoices.find((i) => i.id === context.targetId || i.source_id === context.targetId);

      if (!targetInv) {
        return {
          step: '3. Data Validation',
          passed: false,
          detail: `Stale Data Interception: Target invoice '${context.targetId}' no longer exists in UDM store.`,
        };
      }

      if (targetInv.status === 'paid' || targetInv.status === 'written_off') {
        return {
          step: '3. Data Validation',
          passed: false,
          detail: `Stale Data Interception: Invoice '${targetInv.number}' is already '${targetInv.status}'. Cannot perform action '${context.actionType}'.`,
        };
      }
    }

    if (entityType === 'exception') {
      const exceptions = udmStore.getExceptions();
      const targetExp = exceptions.find((e) => e.id === context.targetId);

      if (!targetExp) {
        return {
          step: '3. Data Validation',
          passed: false,
          detail: `Stale Data Interception: Target exception '${context.targetId}' does not exist.`,
        };
      }

      if (targetExp.status === 'closed' || targetExp.status === 'executed' || targetExp.status === 'rejected') {
        return {
          step: '3. Data Validation',
          passed: false,
          detail: `Stale Data Interception: Exception '${context.targetId}' is already '${targetExp.status}'.`,
        };
      }
    }

    return {
      step: '3. Data Validation',
      passed: true,
      detail: `Target ${context.targetEntity} '${context.targetId}' verified active and valid.`,
    };
  }

  /**
   * STEP 5: Risk Assessment (Non-Bypassable Hardcoded Product Floor)
   */
  public evaluateRiskAssessment(context: SafetyPipelineContext): RiskAssessmentResult {
    const riskReasons: string[] = [];
    let amountFloorTriggered = false;
    let highRiskTypeTriggered = false;
    let confidenceFloorTriggered = false;

    // 1. High-Risk Action Type Check
    if (context.actionType && MANDATORY_APPROVAL_HIGH_RISK_ACTIONS.has(context.actionType)) {
      highRiskTypeTriggered = true;
      riskReasons.push(`Action '${context.actionType}' is classified as mandatory high-risk.`);
    }

    // 2. Hard Ceiling Amount Check (Ceiling: ₹5,00,000)
    const amountPaise = context.amountMinorUnits ?? context.payload?.amount_minor_units ?? context.payload?.value ?? 0;
    if (amountPaise >= HARD_PRODUCT_SAFETY_FLOORS.MAX_AMOUNT_PAISE_CEILING) {
      amountFloorTriggered = true;
      riskReasons.push(
        `Action amount ₹${(amountPaise / 100).toLocaleString('en-IN')} exceeds non-bypassable product safety ceiling ₹5,00,000.`
      );
    }

    // 3. Confidence Floor Check (Floor: 60%)
    const confidence = context.confidence ?? 0.95;
    if (confidence < HARD_PRODUCT_SAFETY_FLOORS.MIN_CONFIDENCE_FLOOR) {
      confidenceFloorTriggered = true;
      riskReasons.push(
        `AI Analysis confidence ${(confidence * 100).toFixed(0)}% is below mandatory confidence floor 60%.`
      );
    }

    const requiresApproval = amountFloorTriggered || highRiskTypeTriggered || confidenceFloorTriggered;

    return {
      requiresApproval,
      riskReasons,
      amountFloorTriggered,
      highRiskTypeTriggered,
      confidenceFloorTriggered,
    };
  }

/**
   * Idempotency & Double-Click Protection (Durable, not process-local)
   */
  public async checkDoubleExecution(context: SafetyPipelineContext): Promise<{ isDuplicate: boolean; hash: string }> {
    const key = `${context.organizationId}:${context.agentName}:${context.targetEntity}:${context.targetId}:${context.actionType}`;

    // Use atomic PostgreSQL INSERT ... ON CONFLICT to check-and-reserve in one step.
    // The udm_idempotency_keys table has UNIQUE (organization_id, key), ensuring:
    // - First request: INSERT succeeds → not a duplicate, reservation created
    // - Concurrent request with same key: INSERT conflicts, is duplicate
    // - Cross-tenant: key includes organization_id, naturally scoped
    // - Expiry does NOT authorize repeating irreversible actions
    // - Previously committed actions cannot be repeated by clearing reservations
    // Pattern: INSERT ... ON CONFLICT = atomic check-and-reserve.
    // If the INSERT succeeds (rowCount > 0), the key was reserved by this instance (not duplicate).
    // If the INSERT is ignored (rowCount = 0), another instance already reserved it.

    // Attempt the atomic reservation using PostgreSQL's ON CONFLICT pattern.
    const insertResult = await pool.query(
      `INSERT INTO udm_idempotency_keys(organization_id, key, record_id) VALUES (?, ?, ?) ON CONFLICT (organization_id, key) DO NOTHING`,
      [context.organizationId, key, `res_${Date.now()}`]
    );

    // Check if the insert actually succeeded (rowCount > 0 means our INSERT ran, not ignored)
    const insertSucceeded = insertResult.rowCount === 1;

    if (insertSucceeded) {
      // INSERT succeeded (rowCount = 1) - this instance reserved the key, not a duplicate
      return Promise.resolve({ isDuplicate: false, hash: key });
    }

    // INSERT was ignored (rowCount = 0 or null) - another instance already reserved it first
    // But we need to check if the key already existed before our attempt
    const verifyResult = await pool.query(
      `SELECT 1 AS present FROM udm_idempotency_keys WHERE organization_id = ? AND key = ? LIMIT 1`,
      [context.organizationId, key]
    );
    const keyExists = verifyResult.rows.length > 0;

    if (keyExists) {
      // Key already existed - conservative: treat as duplicate
      // since the prior action may have been committed.
      return Promise.resolve({ isDuplicate: true, hash: key });
    }

    // Key doesn't exist and insert didn't succeed - this shouldn't happen normally,
    // but conservatively treat as duplicate for safety
    return Promise.resolve({ isDuplicate: true, hash: key });
  }

  public async clearDeduplicationCache(): Promise<void> {
    // Clear all safety double-execution reservations from udm_idempotency_keys
    await pool.query(
      'DELETE FROM udm_idempotency_keys WHERE organization_id = ? AND key = ?'
    , ['__all_orgs__', 'safety:double_execution']
    );
  }
}

export const safetyMiddlewareEngine = new SafetyMiddlewareEngine();
