// AIOSpark Billing Enforcement & Usage Limit Guardrails (Layer 27)

import { billingStore, DEFAULT_PLANS, PlanLimits, UsageSummary } from './store';

export interface UsageLimitStatus {
  orgId: string;
  planId: string;
  usage: UsageSummary;
  limits: PlanLimits;
  invoicePercentUsed: number;
  aiTaskPercentUsed: number;
  agentPercentUsed: number;
  isApproachingInvoiceLimit: boolean; // >= 90%
  isInvoiceLimitExceeded: boolean; // >= 100%
  isAiTaskLimitExceeded: boolean;
  isAgentLimitExceeded: boolean;
  warningMessage?: string | null;
  enforcementAction: 'allow' | 'warning' | 'grace_period' | 'block';
}

export class BillingGuardrail {
  /**
   * Evaluate organization's current usage against plan limits
   */
  public static checkLimitStatus(orgId: string): UsageLimitStatus {
    const sub = billingStore.getSubscription(orgId);
    const plan = DEFAULT_PLANS[sub.plan_id] || DEFAULT_PLANS.starter;
    const summary = billingStore.getUsageSummary(orgId);

    const limits = plan.limits;

    const invoicePercent = Math.min(100, Math.round((summary.invoices_processed / limits.maxInvoicesPerMonth) * 100));
    const aiTaskPercent = Math.min(100, Math.round((summary.ai_tasks_executed / limits.maxAiTasksPerMonth) * 100));
    const agentPercent = Math.min(100, Math.round((summary.agent_executions / limits.maxAgentExecutionsPerMonth) * 100));

    const isApproachingInvoiceLimit = invoicePercent >= 90;
    const isInvoiceLimitExceeded = summary.invoices_processed >= limits.maxInvoicesPerMonth;
    const isAiTaskLimitExceeded = summary.ai_tasks_executed >= limits.maxAiTasksPerMonth;
    const isAgentLimitExceeded = summary.agent_executions >= limits.maxAgentExecutionsPerMonth;

    let warningMessage: string | null = null;
    let enforcementAction: 'allow' | 'warning' | 'grace_period' | 'block' = 'allow';

    if (isInvoiceLimitExceeded || isAiTaskLimitExceeded || isAgentLimitExceeded) {
      enforcementAction = 'grace_period'; // Soft limit grace period policy
      warningMessage = `You have reached 100% of your ${plan.name} plan limit (${summary.invoices_processed}/${limits.maxInvoicesPerMonth} invoices processed). Upgrade your plan to prevent service disruption.`;
    } else if (isApproachingInvoiceLimit) {
      enforcementAction = 'warning';
      warningMessage = `Warning: You have used ${invoicePercent}% of your monthly invoice quota on the ${plan.name} plan. Upgrade now for seamless scaling.`;
    }

    return {
      orgId,
      planId: plan.id,
      usage: summary,
      limits,
      invoicePercentUsed: invoicePercent,
      aiTaskPercentUsed: aiTaskPercent,
      agentPercentUsed: agentPercent,
      isApproachingInvoiceLimit,
      isInvoiceLimitExceeded,
      isAiTaskLimitExceeded,
      isAgentLimitExceeded,
      warningMessage,
      enforcementAction,
    };
  }

  /**
   * Helper to verify if an organization can connect a specific adapter
   */
  public static canConnectIntegration(orgId: string, adapterType: string): { allowed: boolean; reason?: string } {
    const sub = billingStore.getSubscription(orgId);
    const plan = DEFAULT_PLANS[sub.plan_id] || DEFAULT_PLANS.starter;

    const isIncluded = plan.limits.includedIntegrations.includes(adapterType);
    if (isIncluded) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `The ${adapterType.toUpperCase()} ERP integration is not included in the ${plan.name} plan. Upgrade to Growth or Enterprise to connect live ERP adapters.`,
    };
  }
}
