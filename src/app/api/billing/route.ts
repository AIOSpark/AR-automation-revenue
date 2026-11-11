// AIOSpark Billing API Endpoints (Layer 27)

import { NextResponse } from 'next/server';
import { billingStore, DEFAULT_PLANS } from '@/lib/billing/store';
import { BillingGuardrail } from '@/lib/billing/guardrail';
import { PaymentProcessorService } from '@/lib/billing/processor';
import { RazorpayBillingService } from '@/lib/billing/razorpay-service';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';
import { extractIdempotencyKey, computeRequestFingerprint, checkAndReserveIdempotency, finalizeIdempotency, releaseIdempotency } from '@/lib/idempotency';

function isPlanTier(value: unknown): value is keyof typeof DEFAULT_PLANS {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_PLANS, value);
}

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'view', 'billing');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(request.url);
    const orgId = context!.organization.id;

    const sub = billingStore.getSubscription(orgId);
    const plan = DEFAULT_PLANS[sub.plan_id] || DEFAULT_PLANS.starter;
    const limitStatus = BillingGuardrail.checkLimitStatus(orgId);
    const summary = billingStore.getUsageSummary(orgId);

    return NextResponse.json({
      success: true,
      subscription: sub,
      plan,
      availablePlans: Object.values(DEFAULT_PLANS),
      usageSummary: summary,
      limitStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'edit', 'billing');
    if (permissionError) return permissionError;

    // Idempotency: require Idempotency-Key header for financial creation
    const idempotencyKey = extractIdempotencyKey(request);
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required for billing operations' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const fingerprint = computeRequestFingerprint(body);

    // Atomically check and reserve the idempotency key under lock
    const idempotencyCheck = await checkAndReserveIdempotency(context!.organization.id, 'billing', idempotencyKey, fingerprint);
    if (idempotencyCheck.status === 'replay') {
      return NextResponse.json(idempotencyCheck.response, { status: 200 });
    }
    if (idempotencyCheck.status === 'conflict') {
      return NextResponse.json(
        { error: 'Idempotency-Key already used with a different request body' },
        { status: 409 }
      );
    }

    const organizationId = context!.organization.id;

    const pilotError = validatePilotReadOnly(organizationId, 'FINANCIAL_TRANSACTION');
    if (pilotError) {
      releaseIdempotency(organizationId, 'billing', idempotencyKey);
      return pilotError;
    }

    const { action, planId, customerGstin, customerLegalName, customerStateCode } = body;

    if (action === 'create_subscription') {
      if (!isPlanTier(planId) || planId === 'enterprise' || (body.interval !== 'monthly' && body.interval !== 'annual')) {
        releaseIdempotency(organizationId, 'billing', idempotencyKey);
        return NextResponse.json({ success: false, error: 'A supported plan and billing interval are required' }, { status: 400 });
      }
      const subscription = await RazorpayBillingService.createSubscription({
        organizationId,
        planTierId: planId,
        interval: body.interval,
      });

      // Persist the pending checkout intent without granting the plan. The
      // verified webhook is the only path that activates a paid plan.
      const current = billingStore.getSubscription(organizationId);
      billingStore.setSubscription(
        organizationId,
        {
          plan_id: current.plan_id,
          status: current.status,
          pending_plan_id: planId,
          pending_razorpay_subscription_id: subscription.subscriptionId,
        },
        { expectedVersion: current.version ?? 0 }
      );

      const response = { success: true, action: 'create_subscription', ...subscription };

      // Finalize idempotency key after successful creation
      finalizeIdempotency(organizationId, 'billing', idempotencyKey, subscription.subscriptionId, fingerprint, response);

      return NextResponse.json(response);
    }

    if (action === 'change_plan') {
      if (!isPlanTier(planId)) {
        releaseIdempotency(organizationId, 'billing', idempotencyKey);
        return NextResponse.json({ success: false, error: 'planId is required' }, { status: 400 });
      }
      if (planId === 'enterprise') {
        releaseIdempotency(organizationId, 'billing', idempotencyKey);
        return NextResponse.json(
          { success: false, error: 'Enterprise plans require custom sales onboarding.' },
          { status: 400 }
        );
      }

      const currentSubscription = billingStore.getSubscription(organizationId);
      const currentPlan = DEFAULT_PLANS[currentSubscription.plan_id];
      const targetPlan = DEFAULT_PLANS[planId];
      if (targetPlan.price_minor_units > currentPlan.price_minor_units) {
        releaseIdempotency(organizationId, 'billing', idempotencyKey);
        return NextResponse.json(
          {
            success: false,
            error: 'Plan upgrades require a paid Razorpay checkout. Start a subscription and complete payment.',
            requiresPayment: true,
            action: 'create_subscription',
            planId,
            interval: 'monthly',
          },
          { status: 409 }
        );
      }

      try {
        const res = await PaymentProcessorService.changePlan(organizationId, planId);
        const response = {
          success: true,
          action: 'change_plan',
          subscription: res.subscription,
          prorationAmountMinorUnits: res.prorationAmountMinorUnits,
        };

        // Finalize idempotency key after successful creation
        finalizeIdempotency(organizationId, 'billing', idempotencyKey, res.subscription.id, fingerprint, response);

        return NextResponse.json(response);
      } catch (err: any) {
        releaseIdempotency(organizationId, 'billing', idempotencyKey);
        return NextResponse.json(
          { success: false, error: err.message || 'Plan change rejected' },
          { status: 409 }
        );
      }
    }

    if (action === 'generate_invoice') {
      if (
        !isPlanTier(planId) ||
        typeof customerGstin !== 'string' || !customerGstin.trim() ||
        typeof customerLegalName !== 'string' || !customerLegalName.trim() ||
        typeof customerStateCode !== 'string' || !/^\d{2}$/.test(customerStateCode)
      ) {
        releaseIdempotency(organizationId, 'billing', idempotencyKey);
        return NextResponse.json({ success: false, error: 'planId, customerGstin, customerLegalName, and a two-digit customerStateCode are required' }, { status: 400 });
      }
      const gstInvoice = PaymentProcessorService.generateGSTInvoice({
        organization_id: organizationId,
        customer_gstin: customerGstin.trim(),
        customer_legal_name: customerLegalName.trim(),
        customer_state_code: customerStateCode,
        plan_id: planId,
      });

      const response = {
        success: true,
        action: 'generate_invoice',
        invoice: gstInvoice,
      };

      // Finalize idempotency key after successful creation
      finalizeIdempotency(organizationId, 'billing', idempotencyKey, gstInvoice.invoice_number, fingerprint, response);

      return NextResponse.json(response);
    }

    releaseIdempotency(organizationId, 'billing', idempotencyKey);
    return NextResponse.json({ success: false, error: `Unknown billing action: ${action}` }, { status: 400 });
  } catch (err: any) {
    // Key is automatically released by the transaction lock on error
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
