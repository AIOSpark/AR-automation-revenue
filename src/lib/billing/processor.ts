// AIOSpark Payment Processor & GST Compliance Engine (Layer 27)
// Integrates Razorpay sandbox lifecycle and GST tax invoice generation.

import { billingStore, DEFAULT_PLANS, PlanTierId, OrganizationSubscription } from './store';

export interface GSTDetails {
  gstin?: string | null;
  legal_name?: string | null;
  state_code?: string | null; // e.g. "27" for Maharashtra, "07" for Delhi
}

export interface TaxInvoiceItem {
  description: string;
  sac_code: string; // Service Accounting Code, e.g. "998313" for IT Infrastructure & Cloud Services
  amount_minor_units: number;
}

export interface GSTInvoice {
  invoice_number: string;
  organization_id: string;
  customer_gstin: string;
  customer_legal_name: string;
  supplier_gstin: string;
  supplier_legal_name: string;
  place_of_supply: string;
  items: TaxInvoiceItem[];
  subtotal_minor_units: number;
  cgst_minor_units: number;
  sgst_minor_units: number;
  igst_minor_units: number;
  total_tax_minor_units: number;
  grand_total_minor_units: number;
  currency: string;
  created_at: string;
}

export class PaymentProcessorService {
  // Sandbox state simulation
  private static supplierGSTIN = '27AAACA0000A1Z5'; // AIOSpark India Pvt Ltd (Maharashtra)
  private static supplierName = 'AIOSpark Technologies Pvt Ltd';

  /**
   * Create Razorpay Subscription Sandbox Flow
   */
  public static async createSubscription(params: {
    organization_id: string;
    plan_id: PlanTierId;
    customer_email: string;
    gstDetails?: GSTDetails;
  }): Promise<{ subscription: OrganizationSubscription; razorpayPayload: Record<string, any> }> {
    const plan = DEFAULT_PLANS[params.plan_id];
    if (!plan) throw new Error(`Invalid plan ID: ${params.plan_id}`);

    const razorpaySubId = `sub_rzp_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const razorpayCustId = `cust_rzp_test_${Date.now()}`;

    const now = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const sub = billingStore.setSubscription(params.organization_id, {
      plan_id: params.plan_id,
      status: 'active',
      razorpay_subscription_id: razorpaySubId,
      razorpay_customer_id: razorpayCustId,
      current_period_start: now.toISOString(),
      current_period_end: endDate.toISOString(),
    });

    return {
      subscription: sub,
      razorpayPayload: {
        id: razorpaySubId,
        entity: 'subscription',
        plan_id: `plan_rzp_${params.plan_id}`,
        customer_id: razorpayCustId,
        status: 'active',
        current_start: Math.floor(now.getTime() / 1000),
        current_end: Math.floor(endDate.getTime() / 1000),
        charge_at: Math.floor(endDate.getTime() / 1000),
      },
    };
  }

  /**
   * Process Razorpay Webhook Events
   */
  public static async handleWebhookEvent(event: {
    event: 'subscription.charged' | 'subscription.halted' | 'subscription.cancelled';
    payload: {
      subscription: {
        id: string;
        organization_id: string;
        plan_id: PlanTierId;
      };
    };
  }): Promise<OrganizationSubscription> {
    const orgId = event.payload.subscription.organization_id;
    const currentSub = billingStore.getSubscription(orgId);

    switch (event.event) {
      case 'subscription.charged':
        return billingStore.setSubscription(orgId, {
          plan_id: event.payload.subscription.plan_id,
          status: 'active',
          razorpay_subscription_id: event.payload.subscription.id,
          pending_plan_id: null,
          pending_razorpay_subscription_id: null,
        });

      case 'subscription.halted':
        return billingStore.setSubscription(orgId, {
          plan_id: currentSub.plan_id,
          status: 'past_due',
        });

      case 'subscription.cancelled':
        return billingStore.setSubscription(orgId, {
          plan_id: 'starter', // Revert to free/starter on cancellation
          status: 'canceled',
        });

      default:
        return currentSub;
    }
  }

  /**
   * Plan Upgrade / Downgrade Handler (Prorated)
   */
  public static async changePlan(
    organizationId: string,
    newPlanId: PlanTierId
  ): Promise<{ subscription: OrganizationSubscription; prorationAmountMinorUnits: number }> {
    const currentSub = billingStore.getSubscription(organizationId);
    const oldPlan = DEFAULT_PLANS[currentSub.plan_id];
    const newPlan = DEFAULT_PLANS[newPlanId];

    if (!newPlan) throw new Error(`Target plan ${newPlanId} does not exist`);

    if (newPlanId === 'enterprise') {
      throw new Error('Enterprise plans require custom sales onboarding and cannot be self-activated.');
    }

    // Upgrades must be paid for. The plan is activated by the verified Razorpay
    // webhook after checkout, never by a self-service plan change request.
    if (newPlan.price_minor_units > oldPlan.price_minor_units) {
      throw new Error(
        'Plan upgrades require a paid Razorpay checkout. Start a subscription and complete payment; the plan activates only after the verified webhook.'
      );
    }

    if (newPlanId === currentSub.plan_id) {
      return { subscription: currentSub, prorationAmountMinorUnits: 0 };
    }

    // A downgrade must not strand an organization above the target plan's
    // monthly quotas. The Razorpay path enforces this too, but this sandbox /
    // internal processor path must enforce the same invariant on its own.
    const usage = billingStore.getUsageSummary(organizationId);
    const exceededLimits: string[] = [];
    if (usage.invoices_processed > newPlan.limits.maxInvoicesPerMonth) {
      exceededLimits.push(`invoices ${usage.invoices_processed}/${newPlan.limits.maxInvoicesPerMonth}`);
    }
    if (usage.ai_tasks_executed > newPlan.limits.maxAiTasksPerMonth) {
      exceededLimits.push(`AI tasks ${usage.ai_tasks_executed}/${newPlan.limits.maxAiTasksPerMonth}`);
    }
    if (usage.agent_executions > newPlan.limits.maxAgentExecutionsPerMonth) {
      exceededLimits.push(`agent executions ${usage.agent_executions}/${newPlan.limits.maxAgentExecutionsPerMonth}`);
    }
    if (exceededLimits.length > 0) {
      throw new Error(
        `Cannot change to ${newPlan.name}: current usage exceeds the target plan limits (${exceededLimits.join(', ')}).`
      );
    }

    // Proration calculation (Days remaining in period)
    const now = new Date().getTime();
    const periodEnd = new Date(currentSub.current_period_end).getTime();
    const periodStart = new Date(currentSub.current_period_start).getTime();

    const totalDays = Math.max(1, (periodEnd - periodStart) / (1000 * 3600 * 24));
    const daysRemaining = Math.max(0, (periodEnd - now) / (1000 * 3600 * 24));

    const unusedOldValue = (oldPlan.price_minor_units / totalDays) * daysRemaining;
    const newPlanProratedValue = (newPlan.price_minor_units / totalDays) * daysRemaining;

    const prorationAmountMinorUnits = Math.round(newPlanProratedValue - unusedOldValue);

    const updatedSub = billingStore.setSubscription(organizationId, {
      plan_id: newPlanId,
      status: currentSub.status === 'canceled' ? 'active' : currentSub.status,
      pending_plan_id: null,
      pending_razorpay_subscription_id: null,
    });

    return {
      subscription: updatedSub,
      prorationAmountMinorUnits,
    };
  }

  /**
   * GST-Compliant Tax Invoice Generator (India Tax Law Compliant)
   * Captures GSTIN, calculates CGST (9%) + SGST (9%) for intra-state OR IGST (18%) for inter-state.
   */
  public static generateGSTInvoice(params: {
    organization_id: string;
    customer_gstin: string;
    customer_legal_name: string;
    customer_state_code: string; // e.g. "27" (Maharashtra) vs "07" (Delhi)
    plan_id: PlanTierId;
  }): GSTInvoice {
    const plan = DEFAULT_PLANS[params.plan_id];
    const subtotal = plan.price_minor_units;

    // Supplier state code is "27" (Maharashtra)
    const isIntraState = params.customer_state_code === '27';

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isIntraState) {
      cgst = Math.round(subtotal * 0.09); // 9% CGST
      sgst = Math.round(subtotal * 0.09); // 9% SGST
    } else {
      igst = Math.round(subtotal * 0.18); // 18% IGST
    }

    const totalTax = cgst + sgst + igst;
    const grandTotal = subtotal + totalTax;

    const invNum = `INV-SAAS-${Date.now().toString().substring(5)}`;

    return {
      invoice_number: invNum,
      organization_id: params.organization_id,
      customer_gstin: params.customer_gstin,
      customer_legal_name: params.customer_legal_name,
      supplier_gstin: this.supplierGSTIN,
      supplier_legal_name: this.supplierName,
      place_of_supply: `${params.customer_state_code} - State Code`,
      items: [
        {
          description: `AIOSpark ${plan.name} Plan Subscription (Monthly)`,
          sac_code: '998313',
          amount_minor_units: subtotal,
        },
      ],
      subtotal_minor_units: subtotal,
      cgst_minor_units: cgst,
      sgst_minor_units: sgst,
      igst_minor_units: igst,
      total_tax_minor_units: totalTax,
      grand_total_minor_units: grandTotal,
      currency: plan.currency,
      created_at: new Date().toISOString(),
    };
  }
}
