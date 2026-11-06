// AIOSpark Razorpay Subscriptions Integration & Billing Service
import crypto from 'crypto';
import { billingStore, DEFAULT_PLANS, PlanTierId, BillingInterval, SubscriptionStatus } from './store';
import { AuditService } from '../audit/service';
import { readSnapshot, writeSnapshot } from '../db/durable-repository';

export interface RazorpayPlanMapping {
  planTierId: PlanTierId;
  interval: BillingInterval;
  razorpayPlanId: string;
}

export interface BillingEventLog {
  id: string;
  razorpay_event_id?: string | null;
  organization_id: string;
  event_type: string;
  razorpay_subscription_id?: string | null;
  razorpay_payment_id?: string | null;
  payload: Record<string, any>;
  signature_verified: boolean;
  created_at: string;
}

// Test-mode fallbacks are only enabled for the automated test runner. They are
// never used in production, so a missing secret fails closed instead of
// accepting a publicly known signing key.
function testModeFallbacksEnabled(): boolean {
  return process.env.AIOSPARK_TEST_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getKeyId(): string | null {
  return env('RAZORPAY_KEY_ID') || (testModeFallbacksEnabled() ? 'rzp_test_AIOSparkKey123' : null);
}

function getKeySecret(): string | null {
  return env('RAZORPAY_KEY_SECRET') || (testModeFallbacksEnabled() ? 'rzp_test_secret_key_456789' : null);
}

function getWebhookSecret(): string | null {
  return env('RAZORPAY_WEBHOOK_SECRET') || (testModeFallbacksEnabled() ? 'whsec_AIOSparkSecret999' : null);
}

export class RazorpayBillingService {
  private static billingEvents: BillingEventLog[] = readSnapshot<BillingEventLog[]>('razorpay_billing_events') || [];

  // Mapped Razorpay Plan IDs (Test Mode)
  private static PLAN_MAPPINGS: Record<string, string> = {
    'starter_monthly': process.env.RAZORPAY_PLAN_STARTER_MONTHLY || 'plan_H1A2B3C4D5E6F1',
    'starter_annual': process.env.RAZORPAY_PLAN_STARTER_ANNUAL || 'plan_H1A2B3C4D5E6F2',
    'growth_monthly': process.env.RAZORPAY_PLAN_GROWTH_MONTHLY || 'plan_H1A2B3C4D5E6F3',
    'growth_annual': process.env.RAZORPAY_PLAN_GROWTH_ANNUAL || 'plan_H1A2B3C4D5E6F4',
  };

  /**
   * Get Razorpay Plan ID for a given tier and billing interval
   */
  public static getRazorpayPlanId(tier: PlanTierId, interval: BillingInterval): string | null {
    if (tier === 'enterprise') return null; // Enterprise uses custom sales contact
    const key = `${tier}_${interval}`;
    return this.PLAN_MAPPINGS[key] || null;
  }

  /**
   * Creates a Razorpay Subscription (Server-side API Call)
   */
  public static async createSubscription(params: {
    organizationId: string;
    planTierId: PlanTierId;
    interval: BillingInterval;
  }): Promise<{ subscriptionId: string; keyId: string; planTierId: PlanTierId; interval: BillingInterval }> {
    if (process.env.NODE_ENV === 'production' && process.env.RAZORPAY_LIVE_ENABLED !== 'true') {
      throw new Error('Razorpay production billing is not enabled. Configure live credentials and plan mappings first.');
    }
    if (params.planTierId === 'enterprise') {
      throw new Error('Enterprise plan requires custom sales onboarding.');
    }

    const razorpayPlanId = this.getRazorpayPlanId(params.planTierId, params.interval);
    if (!razorpayPlanId) {
      throw new Error(`Invalid plan mapping for ${params.planTierId} ${params.interval}`);
    }

    // Check usage limits if attempting a downgrade
    const currentSub = billingStore.getSubscription(params.organizationId);
    if (currentSub && currentSub.status === 'active') {
      const usage = billingStore.getUsageSummary(params.organizationId);
      const targetPlan = DEFAULT_PLANS[params.planTierId];

      if (targetPlan && usage.invoices_processed > targetPlan.limits.maxInvoicesPerMonth) {
        throw new Error(
          `Cannot downgrade to ${params.planTierId.toUpperCase()}: Current usage (${usage.invoices_processed} invoices) exceeds plan limit (${targetPlan.limits.maxInvoicesPerMonth}).`
        );
      }
    }

    if (process.env.NODE_ENV === 'production') {
      const keyId = getKeyId();
      const keySecret = getKeySecret();
      if (!keyId || !keySecret) {
        throw new Error('Razorpay API credentials are not configured.');
      }

      const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: razorpayPlanId,
          total_count: params.interval === 'annual' ? 1 : 12,
          customer_notify: 1,
          notes: { organization_id: params.organizationId, plan_tier_id: params.planTierId },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => 'Razorpay rejected the subscription request');
        throw new Error(`Razorpay subscription creation failed (${response.status}): ${detail}`);
      }

      const payload = (await response.json()) as { id?: string };
      if (!payload.id) throw new Error('Razorpay returned no subscription ID');

      return {
        subscriptionId: payload.id,
        keyId,
        planTierId: params.planTierId,
        interval: params.interval,
      };
    }

    // Development/test mode only: generate a deterministic local subscription intent.
    const subscriptionId = `sub_test_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

    // Record billing event log
    this.logBillingEvent({
      organization_id: params.organizationId,
      event_type: 'subscription.created_intent',
      razorpay_subscription_id: subscriptionId,
      payload: { planTierId: params.planTierId, interval: params.interval, razorpayPlanId },
      // This is a locally generated checkout intent, not a verified payment.
      signature_verified: false,
    });

    return {
      subscriptionId,
      keyId: getKeyId() || '',
      planTierId: params.planTierId,
      interval: params.interval,
    };
  }

  /**
   * Verify Razorpay Webhook Signature (HMAC SHA256)
   */
  public static isWebhookConfigured(): boolean {
    return getWebhookSecret() !== null;
  }

  public static verifyWebhookSignature(rawBody: string, signature: string, webhookSecret?: string): boolean {
    const secret = webhookSecret?.trim() || getWebhookSecret();
    if (!secret || !signature || !rawBody) return false;
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      const provided = Buffer.from(signature);
      const expected = Buffer.from(expectedSignature);
      if (provided.length !== expected.length) return false;
      return crypto.timingSafeEqual(provided, expected);
    } catch {
      return false;
    }
  }

  /**
   * Process Razorpay Webhook Event (Strict Source of Truth for Subscriptions)
   */
  public static async processWebhookEvent(
    rawBody: string,
    signature: string
  ): Promise<{ success: boolean; message: string; eventType?: string }> {
    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
      return { success: false, message: 'Razorpay webhook signing secret is not configured.' };
    }

    const isValid = this.verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      this.logBillingEvent({
        organization_id: 'unknown',
        event_type: 'webhook.signature_verification_failed',
        payload: { signaturePresent: Boolean(signature), bodyBytes: rawBody.length },
        signature_verified: false,
      });
      return { success: false, message: 'Invalid Razorpay webhook signature. Access denied.' };
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { success: false, message: 'Malformed Razorpay webhook payload.' };
    }
    const eventId = typeof payload.id === 'string' ? payload.id : null;
    if (eventId && this.billingEvents.some((event) => event.razorpay_event_id === eventId && event.signature_verified)) {
      return { success: true, message: 'Webhook event already processed.', eventType: payload.event };
    }
    const eventType = payload.event;
    const subEntity = payload.payload?.subscription?.entity || payload.payload?.payment?.entity;
    const organizationId = subEntity?.notes?.organization_id || payload.notes?.organization_id;
    if (!organizationId) {
      return { success: false, message: 'Webhook is missing the organization binding.' };
    }

    // Log verified event
    this.logBillingEvent({
      organization_id: organizationId,
      razorpay_event_id: eventId,
      event_type: eventType,
      razorpay_subscription_id: subEntity?.id || null,
      razorpay_payment_id: payload.payload?.payment?.entity?.id || null,
      payload,
      signature_verified: true,
    });

    // Handle Subscription State Mutations
    switch (eventType) {
      case 'subscription.activated':
      case 'subscription.charged': {
        const requestedPlan = subEntity?.notes?.plan_tier_id;
        if (
          typeof requestedPlan !== 'string' ||
          !Object.prototype.hasOwnProperty.call(DEFAULT_PLANS, requestedPlan)
        ) {
          return { success: false, message: 'Webhook subscription is missing a valid plan binding.', eventType };
        }
        const planTierId = requestedPlan as PlanTierId;
        billingStore.setSubscription(organizationId, {
          plan_id: planTierId,
          status: 'active',
          razorpay_subscription_id: subEntity?.id || null,
          pending_plan_id: null,
          pending_razorpay_subscription_id: null,
        });

        AuditService.record({
          organization_id: organizationId,
          actor_type: 'system',
          action_type: 'subscription.activated',
          subject_type: 'organization',
          subject_id: organizationId,
          after_state: { status: 'active', planTierId, razorpaySubscriptionId: subEntity?.id },
          result: 'success',
        });
        return { success: true, message: `Subscription activated for organization ${organizationId}`, eventType };
      }

      case 'subscription.halted':
      case 'payment.failed': {
        const currentSub = billingStore.getSubscription(organizationId);
        if (currentSub) {
          billingStore.setSubscription(organizationId, {
            plan_id: currentSub.plan_id,
            status: 'past_due',
          });
        }

        AuditService.record({
          organization_id: organizationId,
          actor_type: 'system',
          action_type: 'subscription.payment_failed',
          subject_type: 'organization',
          subject_id: organizationId,
          after_state: { status: 'past_due' },
          result: 'failure',
        });
        return { success: true, message: `Subscription set to past_due for organization ${organizationId}`, eventType };
      }

      case 'subscription.cancelled': {
        const currentSub = billingStore.getSubscription(organizationId);
        if (currentSub) {
          // Standard SaaS grace period: Access remains active until end of current period, status updated to canceled
          billingStore.setSubscription(organizationId, {
            plan_id: currentSub.plan_id,
            status: 'canceled',
          });
        }

        AuditService.record({
          organization_id: organizationId,
          actor_type: 'system',
          action_type: 'subscription.cancelled',
          subject_type: 'organization',
          subject_id: organizationId,
          after_state: { status: 'canceled' },
          result: 'success',
        });
        return { success: true, message: `Subscription canceled for organization ${organizationId}`, eventType };
      }

      default:
        return { success: true, message: `Webhook event ${eventType} logged successfully`, eventType };
    }
  }

  /**
   * Helper to log billing events
   */
  private static logBillingEvent(data: Omit<BillingEventLog, 'id' | 'created_at'>) {
    const record: BillingEventLog = {
      id: `bill_evt_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    this.billingEvents.push(record);
    writeSnapshot('razorpay_billing_events', this.billingEvents);
  }

  /**
   * Get billing audit history for an organization
   */
  public static getBillingHistory(organizationId: string): BillingEventLog[] {
    return this.billingEvents.filter((evt) => evt.organization_id === organizationId);
  }
}
