import { NextResponse } from 'next/server';
import { alertsEngineStore } from '@/lib/alerts/store';
import { DashboardChannel } from '@/lib/alerts/channels';
import { AlertType } from '@/lib/alerts/types';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const orgId = context!.organization.id;
  const userId = context!.user.id;

  const notifications = DashboardChannel.getInAppNotifications(userId, orgId);
  const alerts = alertsEngineStore.getAlerts(orgId);

  return NextResponse.json({
    organizationId: orgId,
    userId,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    notifications,
    alerts,
  });
}

export async function POST(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'edit', 'invoices');
  if (permissionError) return permissionError;
  const body = await request.json();
  const {
    action,
    notificationId,
    organizationId: _organizationId,
    userId: _userId,
    alertType,
    channel,
    enabled,
  } = body;
  const organizationId = context!.organization.id;
  const userId = context!.user.id;

  if (action === 'mark_read') {
    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
    }
    const success = DashboardChannel.markAsRead(notificationId, userId, organizationId);
    return success
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: 'Notification not found in the active organization' }, { status: 404 });
  }

  if (action === 'update_preference') {
    const supportedAlertTypes: AlertType[] = [
      'severely_overdue_invoice',
      'missed_payment_promise',
      'new_high_risk_customer',
      'successful_reconciliation',
      'ai_quality_degradation',
      'infrastructure_failure',
    ];
    if (
      typeof alertType !== 'string' || !supportedAlertTypes.includes(alertType as AlertType) ||
      typeof channel !== 'string' || !alertsEngineStore.getChannel(channel) ||
      typeof enabled !== 'boolean'
    ) {
      return NextResponse.json({ error: 'alertType, channel, and enabled are required' }, { status: 400 });
    }

    const pref = alertsEngineStore.setPreference({
      user_id: userId,
      organization_id: organizationId,
      alert_type: alertType as AlertType,
      channel,
      enabled,
    });

    return NextResponse.json({ success: true, preference: pref });
  }

  return NextResponse.json({ error: 'Invalid action. Supported: mark_read, update_preference' }, { status: 400 });
}
