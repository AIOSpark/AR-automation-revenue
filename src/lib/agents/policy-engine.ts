// AIOSpark Policy Engine (Layer 17 & Layer 18)
// Data-driven policy configuration for Agent action permissioning, subscription checks, and rate-limiting.
// Layer 18 Hardcoded Approval Floor: High-risk action types CANNOT execute directly and are forced into approval_requests.

import { approvalStore } from '../approvals/store';
import { readSnapshot, writeSnapshot } from '../db/durable-repository';

export interface PolicyRule {
  id: string;
  organizationId: string; // '*' for global default
  agentName: string; // '*' for all agents
  allowedActions: string[]; // Allowed action types e.g. ['SEND_REMINDER', 'CREATE_EXCEPTION']
  maxActionsPerWindow: number; // Rate limit count
  windowSeconds: number; // Time window duration in seconds
  activeSubscriptionRequired: boolean;
}

export interface PolicyContext {
  userRole?: string;
  subscriptionStatus?: 'active' | 'suspended' | 'canceled';
  invoiceAmountMinorUnits?: number;
  confidence?: number;
  evidence?: any[];
  subjectType?: string;
  subjectId?: string;
  payload?: Record<string, any>;
  [key: string]: any;
}

export interface PolicyCheckResult {
  allowed: boolean;
  requiresApproval?: boolean;
  approvalRequestId?: string;
  reason?: string;
  policyId?: string;
}

// HARDCODED MANDATORY APPROVAL ACTION TYPES (No exceptions, cannot be bypassed by org config)
// Customer outreach is an external side effect and therefore remains behind
// the approval floor. Read-only analysis can still run without approval.
export const MANDATORY_APPROVAL_HIGH_RISK_ACTIONS = new Set<string>([
  'ALTER_INVOICE_VALUE',
  'ISSUE_CREDIT_NOTE',
  'RECORD_PAYMENT_MATCH',
  'MODIFY_ACCOUNTING_RECORD',
  'OTHER_HIGH_RISK',
  'RECLASSIFY_INVOICE',
  'SEND_CUSTOMER_COMMUNICATION',
]);

const DEFAULT_GLOBAL_POLICIES: PolicyRule[] = [
  {
    id: 'global_default_policy',
    organizationId: '*',
    agentName: '*',
    allowedActions: [
      'SEND_REMINDER',
      'CREATE_EXCEPTION',
      'FLAG_DISPUTE',
      'UPDATE_RISK_SCORE',
      'ALTER_INVOICE_VALUE',
      'ISSUE_CREDIT_NOTE',
      'RECORD_PAYMENT_MATCH',
      'SEND_CUSTOMER_COMMUNICATION',
      'MODIFY_ACCOUNTING_RECORD',
      'RECLASSIFY_INVOICE',
    ],
    maxActionsPerWindow: 20,
    windowSeconds: 60,
    activeSubscriptionRequired: true,
  },
];

class PolicyEngine {
  private rules: Map<string, PolicyRule> = new Map();
  private actionCounters: Map<string, { count: number; windowStart: number }> = new Map();

  constructor() {
    DEFAULT_GLOBAL_POLICIES.forEach((rule) => this.rules.set(rule.id, rule));
    const persistedRules = readSnapshot<PolicyRule[]>('policy_rules');
    for (const rule of persistedRules || []) this.rules.set(rule.id, rule);
    // Load persisted rate-limit counters from durable storage
    this.loadRateLimitCounters();
  }

  /** Load rate-limit counters from durable snapshot (survives server restarts). */
  private loadRateLimitCounters(): void {
    try {
      const persisted = readSnapshot<Map<string, { count: number; windowStart: number }>>(
        'rate_limit_counters'
      );
      if (persisted) {
        this.actionCounters = new Map(Object.entries(persisted));
      }
    } catch {
      // Corrupt or missing snapshot → start with empty counters
      this.actionCounters = new Map();
    }
  }

  /** Persist rate-limit counters to durable snapshot. */
  private persistRateLimitCounters(): void {
    try {
      writeSnapshot('rate_limit_counters', Object.fromEntries(this.actionCounters));
    } catch {
      // Non-fatal: persistence failure should not block agent execution
    }
  }

  public setPolicyRule(rule: PolicyRule): void {
    this.rules.set(rule.id, rule);
    this.persistRules();
  }

  public removePolicyRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.persistRules();
  }

  public clearRules(): void {
    this.rules.clear();
    DEFAULT_GLOBAL_POLICIES.forEach((rule) => this.rules.set(rule.id, rule));
    this.persistRules();
  }

  public resetRateLimitCounters(): void {
    this.actionCounters.clear();
    this.persistRateLimitCounters();
  }

  private persistRules(): void {
    writeSnapshot('policy_rules', Array.from(this.rules.values()).filter((rule) => rule.organizationId !== '*'));
  }

  public isHighRiskAction(actionType: string): boolean {
    return MANDATORY_APPROVAL_HIGH_RISK_ACTIONS.has(actionType);
  }

  /**
   * Extensible Policy Engine evaluation check with Layer 18 Approval Routing.
   */
  public checkPolicy(
    orgId: string,
    agentName: string,
    actionType?: string,
    context?: PolicyContext
  ): PolicyCheckResult {
    // 1. Subscription Check
    const subStatus = context?.subscriptionStatus || 'active';
    if (subStatus === 'suspended' || subStatus === 'canceled') {
      return {
        allowed: false,
        reason: `Organization '${orgId}' subscription is ${subStatus}. Agent actions are blocked.`,
      };
    }

    if (!actionType) {
      return { allowed: true };
    }

    // 2. Lookup applicable policy rules (Org-specific override first, then global fallback)
    const allRules = Array.from(this.rules.values());
    const matchedRule =
      allRules.find((r) => r.organizationId === orgId && (r.agentName === agentName || r.agentName === '*')) ||
      allRules.find((r) => r.organizationId === '*' && (r.agentName === agentName || r.agentName === '*'));

    if (!matchedRule) {
      return {
        allowed: false,
        reason: `No policy rule defined for organization '${orgId}' and agent '${agentName}'.`,
      };
    }

    // Check if action type is allowed in rule
    if (!matchedRule.allowedActions.includes(actionType) && !matchedRule.allowedActions.includes('*')) {
      return {
        allowed: false,
        reason: `Action type '${actionType}' is not permitted for agent '${agentName}' under policy '${matchedRule.id}'.`,
        policyId: matchedRule.id,
      };
    }

    // 3. Rate Limiting Check
    const nowMs = Date.now();
    const rateLimitKey = `${orgId}:${agentName}`;
    const windowMs = matchedRule.windowSeconds * 1000;
    const currentCounter = this.actionCounters.get(rateLimitKey);

    if (!currentCounter || nowMs - currentCounter.windowStart > windowMs) {
      this.actionCounters.set(rateLimitKey, { count: 1, windowStart: nowMs });
      this.persistRateLimitCounters();
    } else {
      if (currentCounter.count >= matchedRule.maxActionsPerWindow) {
        return {
          allowed: false,
          reason: `Rate limit exceeded for agent '${agentName}' in organization '${orgId}'. Allowed: ${matchedRule.maxActionsPerWindow} actions per ${matchedRule.windowSeconds}s window.`,
          policyId: matchedRule.id,
        };
      }
      currentCounter.count += 1;
      this.persistRateLimitCounters();
    }

    // 4. LAYER 18 HARDCODED MANDATORY APPROVAL FLOOR
    // High-risk actions must ALWAYS route to approval_requests, regardless of confidence or graduated autonomy configs
    if (this.isHighRiskAction(actionType)) {
      const autonomyCfg = approvalStore.getAutonomyConfig(orgId, actionType);
      // Hardcoded floor check: Even if auto_approve_enabled is true, high-risk actions STILL require approval!
      const highRiskMandatory = true;

      if (highRiskMandatory || !autonomyCfg?.auto_approve_enabled) {
        const appReq = approvalStore.createRequest({
          organization_id: orgId,
          subject_type: context?.subjectType || 'invoice',
          subject_id: context?.subjectId || 'subj_unknown',
          action_type: actionType,
          proposed_action: context?.payload || { action: actionType },
          evidence: context?.evidence || [],
          confidence: context?.confidence ?? 0.95,
          proposed_by: agentName,
        });

        return {
          allowed: false, // Cannot execute directly!
          requiresApproval: true,
          approvalRequestId: appReq.id,
          reason: `Action '${actionType}' is a mandatory high-risk action and has been routed to Approval Center (ID: ${appReq.id}).`,
          policyId: matchedRule.id,
        };
      }
    }

    return {
      allowed: true,
      policyId: matchedRule.id,
    };
  }
}

export const policyEngine = new PolicyEngine();
