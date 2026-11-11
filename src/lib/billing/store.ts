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
export const PLAN_TIER_KEYS: PlanTierId[] = ['starter', 'growth', 'enterprise'];
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

export interface EntitlementGrant {
  featureCode: string;
  enabled: boolean;
}

export interface Plan {
  id: PlanTierId;
  name: string;
  price_minor_units: number; // in paise / cents
  currency: string;
  billing_interval: BillingInterval;
  is_public: boolean;
  razorpay_plan_id_test: string | null;
  razorpay_plan_id_live: string | null;
  entitlements: EntitlementGrant[];
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
  billing_interval?: BillingInterval | null;
  grace_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  cancelled_at?: string | null;
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
// PAYMENT, WEBHOOK & REFUND TYPES
// ----------------------------------------------------

export interface Payment {
  id: string;
  organization_id: string;
  source_system: string;
  source_id: string;
  customer_id: string;
  subscription_id?: string | null;
  provider_payment_id: string;
  provider_invoice_id?: string | null;
  amount_minor_units: number;
  currency: string;
  date: string;
  status: 'paid' | 'failed' | 'pending' | 'reversed';
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
  refunded_amount_minor_units: number;
}

export interface WebhookEvent {
  id: string;
  organization_id: string;
  provider_event_id: string;
  event_type: string;
  razorpay_subscription_id?: string | null;
  razorpay_payment_id?: string | null;
  status: 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  retry_count: number;
  max_retries: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundEvent {
  id: string;
  organization_id: string;
  provider_refund_id: string;
  payment_id: string;
  amount_minor_units: number;
  currency: string;
  status: 'PROCESSED' | 'FAILED' | 'PENDING';
  created_at: string;
  updated_at: string;
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
    is_public: false,
    razorpay_plan_id_test: null,
    razorpay_plan_id_live: null,
    entitlements: [
      { featureCode: 'receivables', enabled: true },
      { featureCode: 'customer_360', enabled: true },
      { featureCode: 'cash_unblock', enabled: false },
      { featureCode: 'cfo_intelligence', enabled: false },
      { featureCode: 'causal_graph', enabled: false },
      { featureCode: 'advanced_ai', enabled: false },
      { featureCode: 'exports', enabled: true },
      { featureCode: 'integrations', enabled: false },
      { featureCode: 'multi_user', enabled: true },
    ],
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
    is_public: false,
    razorpay_plan_id_test: null,
    razorpay_plan_id_live: null,
    entitlements: [
      { featureCode: 'receivables', enabled: true },
      { featureCode: 'customer_360', enabled: true },
      { featureCode: 'cash_unblock', enabled: true },
      { featureCode: 'cfo_intelligence', enabled: true },
      { featureCode: 'causal_graph', enabled: true },
      { featureCode: 'advanced_ai', enabled: false },
      { featureCode: 'exports', enabled: true },
      { featureCode: 'integrations', enabled: true },
      { featureCode: 'multi_user', enabled: true },
    ],
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
    is_public: false,
    razorpay_plan_id_test: null,
    razorpay_plan_id_live: null,
    entitlements: [
      { featureCode: 'receivables', enabled: true },
      { featureCode: 'customer_360', enabled: true },
      { featureCode: 'cash_unblock', enabled: true },
      { featureCode: 'cfo_intelligence', enabled: true },
      { featureCode: 'causal_graph', enabled: true },
      { featureCode: 'advanced_ai', enabled: true },
      { featureCode: 'exports', enabled: true },
      { featureCode: 'integrations', enabled: true },
      { featureCode: 'multi_user', enabled: true },
    ],
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
  private payments: Map<string, Payment> = new Map(); // Keyed by payment id
  private webhookEvents: Map<string, WebhookEvent> = new Map(); // Keyed by provider_event_id
  private refundEvents: Map<string, RefundEvent> = new Map(); // Keyed by provider_refund_id

  constructor() {
    const state = readSnapshot<{ events: UsageEvent[]; subscriptions: OrganizationSubscription[]; payments: Payment[]; webhookEvents: WebhookEvent[]; refundEvents: RefundEvent[] }>('billing');
    this.events = state?.events || [];
    this.subscriptions = new Map((state?.subscriptions || []).map((subscription) => [subscription.organization_id, subscription]));
    this.payments = new Map((state?.payments || []).map((payment) => [payment.id, payment]));
    this.webhookEvents = new Map((state?.webhookEvents || []).map((event) => [event.provider_event_id, event]));
    this.refundEvents = new Map((state?.refundEvents || []).map((refund) => [refund.provider_refund_id, refund]));
  }

  private persist(): void {
    writeSnapshot('billing', { events: this.events, subscriptions: Array.from(this.subscriptions.values()), payments: Array.from(this.payments.values()), webhookEvents: Array.from(this.webhookEvents.values()), refundEvents: Array.from(this.refundEvents.values()) });
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
      billing_interval: 'monthly',
      current_period_start: now.toISOString(),
      current_period_end: endDate.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    this.subscriptions.set(orgId, defaultSub);
    this.persist();
    return defaultSub;
  }

  public getAllSubscriptions(): Map<string, OrganizationSubscription> {
    return this.subscriptions;
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

  // --- PLAN CATALOG ---

  public getPlan(planId: PlanTierId, interval: BillingInterval): Plan | null {
    const plan = DEFAULT_PLANS[planId];
    if (!plan) return null;
    return { ...plan, billing_interval: interval };
  }

  public getPublicPlans(): Plan[] {
    return PLAN_TIER_KEYS.map((id) => DEFAULT_PLANS[id]).filter((p): p is Plan => p !== undefined && p.is_public);
  }

  public getAllPlans(): Plan[] {
    return PLAN_TIER_KEYS.map((id) => DEFAULT_PLANS[id]).filter((p): p is Plan => p !== undefined);
  }

  // --- PAYMENTS ---

  public recordPayment(payment: Payment): Payment {
    const id = payment.id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const record: Payment = { ...payment, id, created_at: now, updated_at: now };
    this.payments.set(id, record);
    this.persist();
    return record;
  }

  public getAllPayments(): Payment[] {
    return Array.from(this.payments.values());
  }

  public getPayments(orgId: string): Payment[] {
    return this.getAllPayments().filter((p) => p.organization_id === orgId);
  }

  public getPayment(paymentId: string): Payment | null {
    return this.payments.get(paymentId) || null;
  }

  // --- WEBHOOK EVENTS ---

  public getWebhookEvent(providerEventId: string): WebhookEvent | null {
    return this.webhookEvents.get(providerEventId) || null;
  }

  public updateWebhookEventStatus(providerEventId: string, status: WebhookEvent['status']): void {
    const existing = this.webhookEvents.get(providerEventId);
    if (!existing) return;
    const updated: WebhookEvent = { ...existing, status, updated_at: new Date().toISOString() };
    this.webhookEvents.set(providerEventId, updated);
    this.persist();
  }

  public getAbandonedProcessingEvents(maxAgeMinutes: number): WebhookEvent[] {
    const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
    return Array.from(this.webhookEvents.values()).filter(
      (e) => e.status === 'PROCESSING' && new Date(e.updated_at).getTime() < cutoff,
    );
  }

  public getRetryableFailedEvents(): WebhookEvent[] {
    return Array.from(this.webhookEvents.values()).filter(
      (e) => e.status === 'FAILED' && e.retry_count < e.max_retries,
    );
  }

  public getUnresolvedWebhookEvents(): WebhookEvent[] {
    return Array.from(this.webhookEvents.values()).filter(
      (e) => e.status !== 'PROCESSED',
    );
  }

  // --- REFUND EVENTS ---

  public recordRefundEvent(refund: Omit<RefundEvent, 'id' | 'created_at' | 'updated_at'>): RefundEvent {
    const id = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const record: RefundEvent = { ...refund, id, created_at: now, updated_at: now };
    this.refundEvents.set(id, record);
    this.persist();
    return record;
  }

  public getRefundEvent(providerRefundId: string): RefundEvent | null {
    return this.refundEvents.get(providerRefundId) || null;
  }

  public persistSnapshot(): void {
    this.persist();
  }

  public clearAll(): void {
    this.events = [];
    this.subscriptions.clear();
    deleteSnapshot('billing');
  }
}

export const billingStore = new UsageAndBillingStore();
