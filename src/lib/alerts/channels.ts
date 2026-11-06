// AIOSpark Notification Channel Implementations (Layer 24)
// Implements DashboardChannel and EmailChannel conforming strictly to NotificationChannel.

import { NotificationChannel, Alert } from './types';
import { TransactionalEmailProvider } from '../communication/email-provider';

export interface InAppNotificationRecord {
  id: string;
  user_id: string;
  organization_id: string;
  alert_id: string;
  type: string;
  severity: Alert['severity'];
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

export class DashboardChannel implements NotificationChannel {
  public readonly channelName = 'dashboard';

  private static inAppStore: Map<string, InAppNotificationRecord> = new Map();

  public async send(recipientUserId: string, alert: Alert): Promise<{ success: boolean; error?: string }> {
    const id = `inapp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: InAppNotificationRecord = {
      id,
      user_id: recipientUserId,
      organization_id: alert.organization_id,
      alert_id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      link: alert.link,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    DashboardChannel.inAppStore.set(id, record);
    return { success: true };
  }

  public static getInAppNotifications(userId: string, orgId?: string): InAppNotificationRecord[] {
    return Array.from(this.inAppStore.values()).filter(
      (n) => n.user_id === userId && (!orgId || n.organization_id === orgId)
    );
  }

  public static markAsRead(notificationId: string, userId: string, organizationId: string): boolean {
    const item = this.inAppStore.get(notificationId);
    if (item && item.user_id === userId && item.organization_id === organizationId) {
      item.is_read = true;
      return true;
    }
    return false;
  }

  public static clearAll(): void {
    this.inAppStore.clear();
  }
}

export class EmailChannel implements NotificationChannel {
  public readonly channelName = 'email';

  // Maps userId -> email address (mockable/configurable registry)
  private static userEmailRegistry: Map<string, string> = new Map();

  public static setUserEmail(userId: string, email: string): void {
    this.userEmailRegistry.set(userId, email);
  }

  public async send(recipientUserId: string, alert: Alert): Promise<{ success: boolean; error?: string }> {
    const recipientEmail = EmailChannel.userEmailRegistry.get(recipientUserId);
    if (!recipientEmail && process.env.NODE_ENV === 'production') {
      return { success: false, error: 'No verified email address is registered for this recipient.' };
    }

    const sendRes = await TransactionalEmailProvider.sendEmail({
      toEmail: recipientEmail || `${recipientUserId}@company.com`,
      subject: `[AIOSpark ${alert.severity.toUpperCase()} ALERT] ${alert.title}`,
      body: `${alert.body}\n\nView details: ${alert.link}`,
      organizationId: alert.organization_id,
    });

    if (sendRes.success) {
      return { success: true };
    }
    return { success: false, error: sendRes.errorDetail };
  }

  public static clearAll(): void {
    this.userEmailRegistry.clear();
  }
}
