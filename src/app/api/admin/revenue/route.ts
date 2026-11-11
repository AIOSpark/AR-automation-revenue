// AIOSpark Admin Revenue Overview API
// Server-side billing analytics for platform administrators.
// Tenant customers must never see other organizations' revenue records.

import { NextResponse } from 'next/server';
import { billingStore } from '@/lib/billing/store';
import { RazorpayBillingService } from '@/lib/billing/razorpay-service';
import { authStore } from '@/lib/auth/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { AuditService } from '@/lib/audit/service';

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    // Platform administrator authorization: tenant Owner role is NOT sufficient.
    // Only a dedicated platform administrator may view global revenue.
    if (!authStore.isPlatformAdmin(context.user.id)) {
      return NextResponse.json(
        { error: 'Forbidden: Platform administrator access required for revenue administration.' },
        { status: 403 }
      );
    }

    AuditService.record({
      organization_id: context.organization.id,
      actor_user_id: context.user.id,
      actor_type: 'user',
      action_type: 'platform_admin.revenue_access',
      subject_type: 'organization',
      subject_id: context.organization.id,
      after_state: { accessed_at: new Date().toISOString(), actor_role: context.role },
      result: 'success',
    });

    // Aggregate across all organizations
    const allSubscriptions = Array.from(billingStore.getAllSubscriptions().values());
    const allPayments = Array.from(billingStore.getAllPayments().values());

    // Count unique paying organizations (status active or in grace)
    const payingOrgs = new Set(
      allSubscriptions
        .filter((s) => s.status === 'active' || (s.status === 'past_due' && s.grace_period_end && new Date(s.grace_period_end) > new Date()))
        .map((s) => s.organization_id)
    );

    // Revenue: count only confirmed paid payments (not pending/failed)
    const paidPayments = allPayments.filter((p) => p.status === 'paid');
    const totalCapturedMinorUnits = paidPayments.reduce((sum, p) => sum + p.amount_minor_units, 0);
    const totalRefundedMinorUnits = paidPayments.reduce((sum, p) => sum + (p.refunded_amount_minor_units ?? 0), 0);
    const netCapturedMinorUnits = totalCapturedMinorUnits - totalRefundedMinorUnits;

    // Subscriptions by plan
    const subsByPlan: Record<string, { count: number; revenue: number }> = {};
    for (const sub of allSubscriptions) {
      if (!subsByPlan[sub.plan_id]) {
        subsByPlan[sub.plan_id] = { count: 0, revenue: 0 };
      }
      subsByPlan[sub.plan_id].count += 1;
    }
    for (const p of paidPayments) {
      const sub = allSubscriptions.find((s) => s.razorpay_subscription_id === p.provider_payment_id || s.organization_id === p.organization_id);
      if (sub) {
        subsByPlan[sub.plan_id].revenue += p.amount_minor_units;
      }
    }

    // MRR = Monthly recurring amount + (Annual recurring amount / 12)
    // ARR = MRR × 12
    // Only active subscriptions count. Past-due, canceled, paused excluded.
    let mrrMinorUnits = 0;
    for (const sub of allSubscriptions) {
      if (sub.status !== 'active') continue;
      const plan = billingStore.getPlan(sub.plan_id, sub.billing_interval || 'monthly');
      if (!plan) continue;
      if (sub.billing_interval === 'monthly') {
        mrrMinorUnits += plan.price_minor_units;
      } else {
        // Annual: normalize to monthly by dividing by 12
        mrrMinorUnits += Math.floor(plan.price_minor_units / 12);
      }
    }
    const arrMinorUnits = mrrMinorUnits * 12;

    return NextResponse.json({
      success: true,
      summary: {
        totalOrganizations: allSubscriptions.length,
        payingOrganizations: payingOrgs.size,
        activeSubscriptions: allSubscriptions.filter((s) => s.status === 'active').length,
        pastDueSubscriptions: allSubscriptions.filter((s) => s.status === 'past_due').length,
        canceledSubscriptions: allSubscriptions.filter((s) => s.status === 'canceled').length,
        totalCapturedMinorUnits,
        totalRefundedMinorUnits,
        netCapturedMinorUnits,
        mrrMinorUnits,
        arrMinorUnits,
      },
      subscriptionsByPlan: subsByPlan,
      recentPayments: allPayments
        .filter((p) => p.status === 'paid')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20)
        .map((p) => ({
          id: p.id,
          organization_id: p.organization_id,
          amount_minor_units: p.amount_minor_units,
          currency: p.currency,
          status: p.status,
          paid_at: p.paid_at,
          provider_payment_id: p.provider_payment_id,
        })),
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
