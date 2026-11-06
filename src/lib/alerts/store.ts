// AIOSpark Alerts Engine Core Store, Deduplication & Event Triggers (Layer 24)

import { Alert, AlertDelivery, AlertType, NotificationChannel, NotificationPreference } from './types';
import { DashboardChannel, EmailChannel } from './channels';
import { ExceptionRecord, Customer, Invoice } from '../udm/types';
import { computeCustomerFinancialProfile } from '../customer/risk-engine';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

class AlertsEngineStore {
  private alerts: Map<string, Alert> = new Map();
  private deliveries: Map<string, AlertDelivery> = new Map();
  private preferences: Map<string, NotificationPreference> = new Map();
  private channels: Map<string, NotificationChannel> = new Map();

  // State tracker to detect FIRST TIME transition into 'high' risk rating for a customer
  private customerPriorRiskState: Map<string, 'high' | 'medium' | 'low'> = new Map();

  constructor() {
    const state = readSnapshot<{
      alerts: Alert[];
      deliveries: AlertDelivery[];
      preferences: NotificationPreference[];
      customerPriorRiskState: Array<[string, 'high' | 'medium' | 'low']>;
    }>('alerts');
    this.alerts = new Map((state?.alerts || []).map((alert) => [alert.id, alert]));
    this.deliveries = new Map((state?.deliveries || []).map((delivery) => [delivery.id, delivery]));
    this.preferences = new Map((state?.preferences || []).map((preference) => [
      `${preference.user_id}:${preference.organization_id}:${preference.alert_type}:${preference.channel}`,
      preference,
    ]));
    this.customerPriorRiskState = new Map(state?.customerPriorRiskState || []);
    // Register default channels
    this.registerChannel(new DashboardChannel());
    this.registerChannel(new EmailChannel());
  }

  public registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.channelName, channel);
  }

  private persist(): void {
    writeSnapshot('alerts', {
      alerts: Array.from(this.alerts.values()),
      deliveries: Array.from(this.deliveries.values()),
      preferences: Array.from(this.preferences.values()),
      customerPriorRiskState: Array.from(this.customerPriorRiskState.entries()),
    });
  }

  public getChannel(channelName: string): NotificationChannel | undefined {
    return this.channels.get(channelName);
  }

  // --- PREFERENCES ---
  public setPreference(pref: Omit<NotificationPreference, 'id'>): NotificationPreference {
    const key = `${pref.user_id}:${pref.organization_id}:${pref.alert_type}:${pref.channel}`;
    const record: NotificationPreference = { ...pref, id: `pref_${key}` };
    this.preferences.set(key, record);
    this.persist();
    return record;
  }

  public isChannelEnabledForUser(
    userId: string,
    orgId: string,
    alertType: AlertType,
    channelName: string
  ): boolean {
    const key = `${userId}:${orgId}:${alertType}:${channelName}`;
    const pref = this.preferences.get(key);
    if (pref !== undefined) return pref.enabled;
    return true; // Enabled by default if no explicit opt-out preference set
  }

  // --- IDEMPOTENCY & DISPATCH ---
  /**
   * Dispatch an Alert with Idempotency Key Deduplication & Generic Channel Routing
   */
  public async triggerAlert(
    alertInput: Omit<Alert, 'id' | 'triggered_at'>,
    recipientUserIds: string[]
  ): Promise<{ alert: Alert; isDuplicate: boolean; totalDeliveriesSent: number }> {
    // 1. Idempotency Key Deduplication check
    const existingAlert = Array.from(this.alerts.values()).find(
      (a) => a.idempotency_key === alertInput.idempotency_key
    );

    if (existingAlert) {
      return { alert: existingAlert, isDuplicate: true, totalDeliveriesSent: 0 };
    }

    // Create new Alert
    const id = `alrt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const alert: Alert = {
      ...alertInput,
      id,
      triggered_at: now,
    };
    this.alerts.set(id, alert);

    let totalDeliveriesSent = 0;

    // 2. Dispatch via enabled channels generically
    for (const userId of recipientUserIds) {
      for (const [channelName, channel] of this.channels.entries()) {
        const isEnabled = this.isChannelEnabledForUser(
          userId,
          alert.organization_id,
          alert.type,
          channelName
        );

        if (!isEnabled) continue;

        const res = await channel.send(userId, alert);
        const delivId = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const deliveryRecord: AlertDelivery = {
          id: delivId,
          alert_id: alert.id,
          user_id: userId,
          channel: channelName,
          status: res.success ? 'sent' : 'failed',
          sent_at: new Date().toISOString(),
          error_detail: res.error || null,
        };

        this.deliveries.set(delivId, deliveryRecord);
        if (res.success) totalDeliveriesSent++;
      }
    }

    this.persist();

    return { alert, isDuplicate: false, totalDeliveriesSent };
  }

  // --- EVENT HOOK LISTENERS (RULES 1 - 4) ---

  /**
   * RULE 1: Severely Overdue Invoice Event Listener
   * Triggers when an exception severity crosses into 'critical'.
   */
  public async onExceptionCreatedOrUpdated(
    exception: ExceptionRecord,
    invoice?: Invoice | null,
    recipientUserIds: string[] = ['usr_mgr_1']
  ): Promise<{ alertTriggered: boolean }> {
    if (exception.severity !== 'critical') {
      return { alertTriggered: false };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const idempotencyKey = `${exception.organization_id}:severely_overdue:${exception.id}:${todayStr}`;

    const invNum = invoice?.number || exception.invoice_id || 'UNKNOWN';

    const res = await this.triggerAlert(
      {
        organization_id: exception.organization_id,
        type: 'severely_overdue_invoice',
        severity: 'critical',
        title: `CRITICAL: Invoice ${invNum} Severely Overdue`,
        body: `Invoice ${invNum} has crossed critical threshold with ${exception.type} exception. Action required immediately.`,
        link: exception.invoice_id ? `/invoices/${exception.invoice_id}` : `/exceptions`,
        idempotency_key: idempotencyKey,
      },
      recipientUserIds
    );

    return { alertTriggered: !res.isDuplicate };
  }

  /**
   * RULE 2: Missed Payment Promise Event Listener
   * Triggers when a promise transitions to 'broken' status.
   */
  public async onPromiseStatusChanged(
    promiseId: string,
    status: string,
    orgId: string,
    customerId: string,
    promisedAmountMinorUnits: number,
    recipientUserIds: string[] = ['usr_mgr_1']
  ): Promise<{ alertTriggered: boolean }> {
    if (status !== 'broken') {
      return { alertTriggered: false };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const idempotencyKey = `${orgId}:missed_promise:${promiseId}:${todayStr}`;
    const amountFormatted = (promisedAmountMinorUnits / 100).toLocaleString('en-IN');

    const res = await this.triggerAlert(
      {
        organization_id: orgId,
        type: 'missed_payment_promise',
        severity: 'high',
        title: `HIGH: Payment Promise Broken by Customer`,
        body: `Customer ${customerId} broke payment promise of ₹${amountFormatted}. Follow-up triggered.`,
        link: `/customers/${customerId}`,
        idempotency_key: idempotencyKey,
      },
      recipientUserIds
    );

    return { alertTriggered: !res.isDuplicate };
  }

  /**
   * RULE 3: New High-Risk Customer Event Listener
   * Triggers ONLY on the FIRST transition into 'high' risk rating (not repeat recalculations while still high).
   */
  public async onCustomerRiskRecalculated(
    customerId: string,
    orgId: string,
    recipientUserIds: string[] = ['usr_mgr_1'],
    todayStr?: string
  ): Promise<{ alertTriggered: boolean }> {
    const profile = computeCustomerFinancialProfile(customerId, orgId, todayStr);
    const priorRisk = this.customerPriorRiskState.get(customerId) || 'low';

    // Update state tracker
    this.customerPriorRiskState.set(customerId, profile.riskBand);
    this.persist();

    // Only fire if transitioning into 'high' from non-high!
    if (profile.riskBand === 'high' && priorRisk !== 'high') {
      const todayStr = new Date().toISOString().split('T')[0];
      const idempotencyKey = `${orgId}:new_high_risk:${customerId}:${todayStr}`;

      const res = await this.triggerAlert(
        {
          organization_id: orgId,
          type: 'new_high_risk_customer',
          severity: 'high',
          title: `HIGH RISK: Customer ${profile.customerName} Rating Escalated`,
          body: `Customer ${profile.customerName} risk score reached ${profile.riskScore}/100. Rating band escalated to HIGH.`,
          link: `/customers/${customerId}`,
          idempotency_key: idempotencyKey,
        },
        recipientUserIds
      );

      return { alertTriggered: !res.isDuplicate };
    }

    return { alertTriggered: false };
  }

  /**
   * RULE 4: Successful Reconciliation Event Listener
   * Triggers when a payment match is approved in Layer 21.
   */
  public async onReconciliationApproved(
    bankTransactionId: string,
    orgId: string,
    matchedAmountMinorUnits: number,
    invoiceNumbers: string[],
    recipientUserIds: string[] = ['usr_mgr_1']
  ): Promise<{ alertTriggered: boolean }> {
    const todayStr = new Date().toISOString().split('T')[0];
    const idempotencyKey = `${orgId}:reconciled:${bankTransactionId}:${todayStr}`;
    const amountFormatted = (matchedAmountMinorUnits / 100).toLocaleString('en-IN');

    const res = await this.triggerAlert(
      {
        organization_id: orgId,
        type: 'successful_reconciliation',
        severity: 'low',
        title: `Payment Reconciled: ₹${amountFormatted}`,
        body: `Payment of ₹${amountFormatted} successfully reconciled against invoice(s) ${invoiceNumbers.join(', ')}.`,
        link: `/receivables`,
        idempotency_key: idempotencyKey,
      },
      recipientUserIds
    );

    return { alertTriggered: !res.isDuplicate };
  }

  // --- UTILS ---
  public getAlerts(orgId: string): Alert[] {
    return Array.from(this.alerts.values()).filter((a) => a.organization_id === orgId);
  }

  public getDeliveries(orgId?: string): AlertDelivery[] {
    return Array.from(this.deliveries.values());
  }

  public clearAll(): void {
    this.alerts.clear();
    this.deliveries.clear();
    this.preferences.clear();
    this.customerPriorRiskState.clear();
    deleteSnapshot('alerts');
  }
}

export const alertsEngineStore = new AlertsEngineStore();
