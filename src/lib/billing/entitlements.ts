// AIOSpark Entitlement Engine (Layer 27)
// Centralized plan-based feature access and usage quota enforcement.
// All entitlement lookups are derived from the organization's active subscription
// and the internal plan catalog. Never trusts frontend subscription state.

import { billingStore, DEFAULT_PLANS, PlanTierId, BillingInterval, OrganizationSubscription } from './store';
import { resolveTenantContext } from '@/lib/tenant/middleware';
import { NextResponse } from 'next/server';
import { pilotAccessEngine } from './pilot-access';

export type FeatureCode =
  | 'receivables'
  | 'customer_360'
  | 'cash_unblock'
  | 'cfo_intelligence'
  | 'causal_graph'
  | 'advanced_ai'
  | 'exports'
  | 'integrations'
  | 'multi_user'
  | string;

export type LimitCode =
  | 'maxInvoicesPerMonth'
  | 'maxAiTasksPerMonth'
  | 'maxAgentExecutionsPerMonth'
  | 'maxCustomers'
  | 'maxImportsPerMonth'
  | 'maxAiOperationsPerMonth'
  | string;

export interface FeatureEntitlement {
  featureCode: string;
  enabled: boolean;
  limit?: number | null;
}

export interface OrganizationEntitlements {
  organizationId: string;
  planId: PlanTierId;
  planCode: string;
  planName: string;
  billingInterval: BillingInterval;
  subscriptionStatus: string;
  isActive: boolean;
  features: FeatureEntitlement[];
  limits: {
    maxInvoicesPerMonth: number;
    maxAiTasksPerMonth: number;
    maxAgentExecutionsPerMonth: number;
    includedIntegrations: string[];
    allowCustomIntegrations: boolean;
    ssoSupported: boolean;
  };
  entitlementCheckedAt: string;
}

export interface UsageCheckResult {
  limitCode: string;
  limit: number;
  currentUsage: number;
  remaining: number;
  allowed: boolean;
}

class EntitlementEngine {
  /**
   * Resolve the full entitlement bundle for an organization from its active subscription.
   */
  public getOrganizationEntitlements(organizationId: string): OrganizationEntitlements {
    const sub = billingStore.getSubscription(organizationId);
    const plan = billingStore.getPlan(sub.plan_id, sub.billing_interval || 'monthly');
    if (!plan) {
      throw new Error(`No active plan found for organization ${organizationId}`);
    }

    const isActive = this.isAccessActive(sub);

    const summary = billingStore.getUsageSummary(organizationId);

    return {
      organizationId,
      planId: plan.id,
      planCode: plan.id,
      planName: plan.name,
      billingInterval: sub.billing_interval || 'monthly',
      subscriptionStatus: sub.status,
      isActive,
      features: plan.features.map((f) => ({
        featureCode: f,
        enabled: isActive,
        limit: null,
      })),
      limits: plan.limits,
      entitlementCheckedAt: new Date().toISOString(),
    };
  }

  /**
   * Check whether an organization has access to a specific feature.
   * Returns false if subscription is not active or feature is not entitled.
   */
  public hasFeatureAccess(organizationId: string, featureCode: FeatureCode): boolean {
    const entitlements = this.getOrganizationEntitlements(organizationId);
    const feature = entitlements.features.find((f) => f.featureCode === featureCode);
    const subscriptionActive = Boolean(feature?.enabled && entitlements.isActive);
    const isTrialing = entitlements.subscriptionStatus === 'trialing' && entitlements.isActive;
    const trialAllowed = isTrialing && ['receivables', 'customer_360', 'cash_unblock', 'cfo_intelligence', 'causal_graph', 'exports'].includes(featureCode);
    // A read-only pilot grant enables the named feature without a paid
    // subscription. It never unlocks mutations or execution.
    const pilotAccess = pilotAccessEngine.hasPilotFeatureAccess(organizationId, featureCode);
    return Boolean(subscriptionActive || trialAllowed || pilotAccess);
  }

  /**
   * Throws if the organization does not have access to a feature.
   * Use in server-side service functions to enforce entitlements.
   */
  public requireFeatureAccess(organizationId: string, featureCode: FeatureCode): void {
    if (!this.hasFeatureAccess(organizationId, featureCode)) {
      const entitlements = this.getOrganizationEntitlements(organizationId);
      const feature = entitlements.features.find((f) => f.featureCode === featureCode);
      const reason = feature
        ? `Feature '${featureCode}' is not enabled on the ${entitlements.planName} plan.`
        : `Feature '${featureCode}' is not a recognized entitlement.`;
      throw new Error(`Entitlement denied: ${reason}`);
    }
  }

  /**
   * Check usage against a plan limit. Returns whether the requested usage is allowed.
   */
  public checkUsageLimit(organizationId: string, limitCode: LimitCode, requestedUsage: number = 1): UsageCheckResult {
    const sub = billingStore.getSubscription(organizationId);
    const plan = billingStore.getPlan(sub.plan_id, sub.billing_interval || 'monthly');
    if (!plan) {
      throw new Error(`No active plan found for organization ${organizationId}`);
    }

    const isActive = this.isAccessActive(sub);
    if (!isActive) {
      return {
        limitCode,
        limit: 0,
        currentUsage: 0,
        remaining: 0,
        allowed: false,
      };
    }

    const summary = billingStore.getUsageSummary(organizationId);
    let limit = 0;
    let currentUsage = 0;

    switch (limitCode) {
      case 'maxInvoicesPerMonth':
        limit = plan.limits.maxInvoicesPerMonth;
        currentUsage = summary.invoices_processed;
        break;
      case 'maxAiTasksPerMonth':
        limit = plan.limits.maxAiTasksPerMonth;
        currentUsage = summary.ai_tasks_executed;
        break;
      case 'maxAgentExecutionsPerMonth':
        limit = plan.limits.maxAgentExecutionsPerMonth;
        currentUsage = summary.agent_executions;
        break;
      default:
        limit = 0;
        currentUsage = 0;
    }

    const remaining = Math.max(0, limit - currentUsage);
    const allowed = isActive && currentUsage + requestedUsage <= limit;

    return {
      limitCode,
      limit,
      currentUsage,
      remaining,
      allowed,
    };
  }

  /**
   * Get remaining quota for a limit code.
   */
  public getRemainingQuota(organizationId: string, limitCode: LimitCode): number {
    const result = this.checkUsageLimit(organizationId, limitCode, 0);
    return result.remaining;
  }

  /**
   * Synchronize entitlements from the authoritative subscription/plan records.
   * Returns the synchronized entitlement bundle.
   */
  public synchronizeOrganizationEntitlements(organizationId: string): OrganizationEntitlements {
    // Re-read from store to ensure consistency
    return this.getOrganizationEntitlements(organizationId);
  }

  /**
   * Check whether an organization has active feature access based on subscription state.
   * Policy:
   * - Active: full purchased access
   * - Past due within grace period: purchased features remain unlocked (billing warning)
   * - Past due after grace period: paid features restricted
   * - Paused: restricted
   * - Canceled with paid period remaining: access until paid-through date
   * - Expired/completed: paid features locked
   */
  private isAccessActive(sub: OrganizationSubscription): boolean {
    if (sub.status === 'active') return true;
    if (sub.status === 'trialing') {
      return !sub.current_period_end || Date.now() < new Date(sub.current_period_end).getTime();
    }
    if (sub.status === 'past_due' && sub.grace_period_end) {
      return Date.now() < new Date(sub.grace_period_end).getTime();
    }
    if (sub.status === 'canceled' && sub.current_period_end) {
      return Date.now() < new Date(sub.current_period_end).getTime();
    }
    return false;
  }

  /**
   * Middleware helper: enforce feature access on an API route.
   * Returns null if allowed, or an error NextResponse if denied.
   */
  public enforceFeatureAccess(organizationId: string, featureCode: FeatureCode): NextResponse | null {
    try {
      this.requireFeatureAccess(organizationId, featureCode);
      return null;
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || 'Feature access denied' },
        { status: 403 }
      );
    }
  }

  /**
   * Middleware helper: enforce usage limit on an API route.
   * Returns null if allowed, or an error NextResponse if denied.
   */
  public enforceUsageLimit(
    organizationId: string,
    limitCode: LimitCode,
    requestedUsage: number = 1
  ): NextResponse | null {
    const check = this.checkUsageLimit(organizationId, limitCode, requestedUsage);
    if (!check.allowed) {
      return NextResponse.json(
        {
          error: `Usage limit exceeded for '${check.limitCode}'. Current: ${check.currentUsage}/${check.limit}. Remaining: ${check.remaining}.`,
          limitCode,
          currentUsage: check.currentUsage,
          limit: check.limit,
          remaining: check.remaining,
        },
        { status: 403 }
      );
    }
    return null;
  }
}

export const entitlementEngine = new EntitlementEngine();
