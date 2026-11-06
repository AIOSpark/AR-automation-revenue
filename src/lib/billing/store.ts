// AIOSpark Usage Tracking & Plan Definition Store (Layer 27)
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export type UsageEventType =
  | 'invoice.processed'
  | 'customer.tracked'
  | 'ai_task.executed'
  | 'integration.connected'
  | 'agent_execution';

export interface UsageEvent {
  id: string;
  organization_id: string;
  event_type: UsageEventType;
  quantity: number;
  metadata?: Record<string, any> | null;
  occurred_at: string;
}

export type PlanTierId = 'starter' | 'growth' | 'enterprise';
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface PlanLimits {
  maxInvoicesPerMonth: number;
  maxAiTasksPerMonth: number;
  maxAgentExecutionsPerMonth: number;
  includedIntegrations: string[]; // e.g. ['csv'], ['csv', 'zoho', 'tally']
  allowCustomIntegrations: boolean;
  ssoSupported: boolean;
}

export interface Plan {
  id: PlanTierId;
  name: string;
  price_minor_units: number; // in paise / cents
  currency: string;
  billing_interval: BillingInterval;
  limits: PlanLimits;
  features: string[];
}

export interface OrganizationSubscription {
  id: string;
  organization_id: string;
  plan_id: PlanTierId;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  razorpay_subscription_id?: string | null;
  razorpay_customer_id?: string | null;
  pending_plan_id?: PlanTierId | null;
  pending_razorpay_subscription_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageSummary {
  organization_id: string;
  period: string; // YYYY-MM
  invoices_processed: number;
  customers_tracked: number;
  ai_tasks_executed: number;
  agent_executions: number;
  integrations_connected: number;
}

// ----------------------------------------------------
// DEFAULT PLAN TIERS MATRIX
// ----------------------------------------------------
export const DEFAULT_PLANS: Record<PlanTierId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price_minor_units: 499900, // ₹4,999 / month
    currency: 'INR',
    billing_interval: 'monthly',
    limits: {
      maxInvoicesPerMonth: 500,
      maxAiTasksPerMonth: 200,
      maxAgentExecutionsPerMonth: 50,
      includedIntegrations: ['csv'],
      allowCustomIntegrations: false,
      ssoSupported: false,
    },
    features: [
      'Up to 500 Invoices / mo',
      '200 AI Reasoning Tasks',
      'CSV Batch Import',
      'Basic Aging & DSO Reports',
      'Standard Support',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price_minor_units: 1499900, // ₹14,999 / month
    currency: 'INR',
    billing_interval: 'monthly',
    limits: {
      maxInvoicesPerMonth: 2500,
      maxAiTasksPerMonth: 1000,
      maxAgentExecutionsPerMonth: 500,
      includedIntegrations: ['csv', 'zoho', 'tally'],
      allowCustomIntegrations: true,
      ssoSupported: false,
    },
    features: [
      'Up to 2,500 Invoices / mo',
      '1,000 AI Reasoning Tasks',
      '500 Agent Executions',
      'ERP Sync (Zoho & Tally)',
      'Human Approval Workflow UI',
      'Promise-to-Pay Engine',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price_minor_units: 4999900, // ₹49,999 / month
    currency: 'INR',
    billing_interval: 'monthly',
    limits: {
      maxInvoicesPerMonth: 100000,
      maxAiTasksPerMonth: 100000,
      maxAgentExecutionsPerMonth: 100000,
      includedIntegrations: ['csv', 'zoho', 'tally', 'custom'],
      allowCustomIntegrations: true,
      ssoSupported: true,
    },
    features: [
      'Unlimited / Custom Invoice Quota',
      'Unlimited AI Reasoning & Agents',
      'Custom ERP Integrations',
      'SAML/Okta SSO',
      'Dedicated Account Manager',
      'Custom SLA & Compliance Terms',
    ],
  },
};

class UsageAndBillingStore {
  private events: UsageEvent[] = [];
  private subscriptions: Map<string, OrganizationSubscription> = new Map(); // Keyed by orgId

  constructor() {
    const state = readSnapshot<{ events: UsageEvent[]; subscriptions: OrganizationSubscription[] }>('billing');
    this.events = state?.events || [];
    this.subscriptions = new Map((state?.subscriptions || []).map((subscription) => [subscription.organization_id, subscription]));
  }

  private persist(): void {
    writeSnapshot('billing', { events: this.events, subscriptions: Array.from(this.subscriptions.values()) });
  }

  // --- USAGE TRACKING ---
  public recordEvent(params: {
    organization_id: string;
    event_type: UsageEventType;
    quantity?: number;
    metadata?: Record<string, any> | null;
  }): UsageEvent {
    const id = `use_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const event: UsageEvent = {
      id,
      organization_id: params.organization_id,
      event_type: params.event_type,
      quantity: params.quantity ?? 1,
      metadata: params.metadata ?? null,
      occurred_at: new Date().toISOString(),
    };

    this.events.push(event);
    this.persist();
    return event;
  }

  public getEvents(orgId: string): UsageEvent[] {
    return this.events.filter((e) => e.organization_id === orgId);
  }

  /**
   * Rollup materialized view calculation per organization per month
   */
  public getUsageSummary(orgId: string, period?: string): UsageSummary {
    const targetPeriod = period || new Date().toISOString().substring(0, 7); // YYYY-MM

    const orgEvents = this.events.filter(
      (e) => e.organization_id === orgId && e.occurred_at.startsWith(targetPeriod)
    );

    const summary: UsageSummary = {
      organization_id: orgId,
      period: targetPeriod,
      invoices_processed: 0,
      customers_tracked: 0,
      ai_tasks_executed: 0,
      agent_executions: 0,
      integrations_connected: 0,
    };

    for (const ev of orgEvents) {
      switch (ev.event_type) {
        case 'invoice.processed':
          summary.invoices_processed += ev.quantity;
          break;
        case 'customer.tracked':
          summary.customers_tracked += ev.quantity;
          break;
        case 'ai_task.executed':
          summary.ai_tasks_executed += ev.quantity;
          break;
        case 'agent_execution':
          summary.agent_executions += ev.quantity;
          break;
        case 'integration.connected':
          summary.integrations_connected += ev.quantity;
          break;
      }
    }

    return summary;
  }

  // --- SUBSCRIPTION MANAGEMENT ---
  public getSubscription(orgId: string): OrganizationSubscription {
    const existing = this.subscriptions.get(orgId);
    if (existing) return existing;

    // Default auto-created subscription is Starter (Trialing or Active)
    const now = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const defaultSub: OrganizationSubscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      organization_id: orgId,
      plan_id: 'starter',
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: endDate.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    this.subscriptions.set(orgId, defaultSub);
    this.persist();
    return defaultSub;
  }

  public setSubscription(orgId: string, sub: Partial<OrganizationSubscription> & { plan_id: PlanTierId }): OrganizationSubscription {
    const current = this.getSubscription(orgId);
    const updated: OrganizationSubscription = {
      ...current,
      ...sub,
      updated_at: new Date().toISOString(),
    };
    this.subscriptions.set(orgId, updated);
    this.persist();
    return updated;
  }

  public clearAll(): void {
    this.events = [];
    this.subscriptions.clear();
    deleteSnapshot('billing');
  }
}

export const billingStore = new UsageAndBillingStore();
