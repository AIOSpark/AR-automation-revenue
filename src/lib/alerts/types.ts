// AIOSpark Alerts Engine Data Types & Channel Interfaces (Layer 24)

import { ExceptionSeverity } from '../udm/types';

export type AlertType =
  | 'severely_overdue_invoice'
  | 'missed_payment_promise'
  | 'new_high_risk_customer'
  | 'successful_reconciliation'
  | 'ai_quality_degradation'
  | 'infrastructure_failure';

export interface Alert {
  id: string;
  organization_id: string;
  type: AlertType;
  severity: ExceptionSeverity; // Exactly re-uses Layer 15 severity model ('critical' | 'high' | 'medium' | 'low')
  title: string;
  body: string;
  link: string; // Deep link e.g. "/invoices/inv_123" or "/customers/cust_456"
  triggered_at: string;
  idempotency_key: string;
  is_read?: boolean;
}

export interface AlertDelivery {
  id: string;
  alert_id: string;
  user_id: string;
  channel: string; // 'dashboard' | 'email' | 'slack' | 'teams' | 'whatsapp'
  status: 'sent' | 'failed';
  sent_at: string;
  error_detail?: string | null;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  organization_id: string;
  alert_type: AlertType;
  channel: string;
  enabled: boolean;
}

/**
 * Generic NotificationChannel Interface Contract
 * Allows Slack, Teams, WhatsApp, etc. to be added seamlessly in the future by implementing this interface.
 */
export interface NotificationChannel {
  readonly channelName: string;
  send(recipientUserId: string, alert: Alert): Promise<{ success: boolean; error?: string }>;
}
