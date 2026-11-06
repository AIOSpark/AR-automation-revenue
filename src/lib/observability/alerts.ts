// AIOSpark Observability Alerting Engine (Layer 29)
// Fires internal ops alerts on AI quality degradation (override rate spikes above threshold with minimum sample size)
// and infrastructure metrics degradation (error rates, latency, integration sync failures).

import { aiQualityStore, TAXONOMY_CATEGORIES, TaxonomyCategory } from './ai-quality';
import { observabilityStore } from './store';
import { alertsEngineStore } from '../alerts/store';
import { Alert } from '../alerts/types';

export interface AIQualityAlertConfig {
  overrideRateThreshold: number; // default 0.30 (30%)
  rollingWindowDays: number; // default 7 days
  minSampleSize: number; // default 20 sample items to prevent false alarms
}

export interface InfraAlertConfig {
  maxErrorRate: number; // default 0.05 (5%)
  maxP95LatencyMs: number; // default 2000 ms
  maxIntegrationFailureRate: number; // default 0.10 (10%)
}

export interface QualityDegradationAlert {
  category: TaxonomyCategory;
  override_rate: number;
  threshold: number;
  sample_size: number;
  min_sample_size: number;
  fired_at: string;
  message: string;
}

export class ObservabilityAlertEngine {
  private static defaultQualityConfig: AIQualityAlertConfig = {
    overrideRateThreshold: 0.30,
    rollingWindowDays: 7,
    minSampleSize: 20,
  };

  private static defaultInfraConfig: InfraAlertConfig = {
    maxErrorRate: 0.05,
    maxP95LatencyMs: 2000,
    maxIntegrationFailureRate: 0.10,
  };

  /**
   * Evaluates AI-Quality Degradation alerts across all 11 taxonomy categories.
   * Enforces strict minimum sample size condition before firing alerts.
   */
  public static checkAIQualityAlerts(
    orgId?: string,
    customConfig?: Partial<AIQualityAlertConfig>
  ): QualityDegradationAlert[] {
    const config: AIQualityAlertConfig = { ...this.defaultQualityConfig, ...customConfig };
    const triggeredAlerts: QualityDegradationAlert[] = [];

    for (const category of TAXONOMY_CATEGORIES) {
      const metrics = aiQualityStore.getCategoryMetrics(category, orgId, config.rollingWindowDays);

      // NON-NEGOTIABLE CONSTRAINT: Check minimum sample size condition
      if (metrics.total_reviewed < config.minSampleSize) {
        continue; // Skip categories with insufficient sample size to avoid false alarms
      }

      if (metrics.human_override_rate > config.overrideRateThreshold) {
        const message = `AI Quality Alert: Human override rate for category '${category}' reached ${(metrics.human_override_rate * 100).toFixed(1)}% (threshold: ${(config.overrideRateThreshold * 100).toFixed(0)}%) based on ${metrics.total_reviewed} reviews over ${config.rollingWindowDays} days.`;

        const alertItem: QualityDegradationAlert = {
          category,
          override_rate: metrics.human_override_rate,
          threshold: config.overrideRateThreshold,
          sample_size: metrics.total_reviewed,
          min_sample_size: config.minSampleSize,
          fired_at: new Date().toISOString(),
          message,
        };

        triggeredAlerts.push(alertItem);

        // Fire alert into Layer 24 AlertEngineStore
        alertsEngineStore.triggerAlert(
          {
            organization_id: orgId || 'org_system',
            title: `AI Quality Degradation Alert: ${category}`,
            severity: 'high',
            type: 'ai_quality_degradation',
            body: message,
            link: '/admin/ai-tasks',
            idempotency_key: `ai_qual_alert_${category}_${Date.now()}`,
          },
          ['user_admin_ops']
        ).catch(() => {});
      }
    }

    return triggeredAlerts;
  }

  /**
   * Evaluates Infrastructure metrics alerts (error rate spikes, latency, integration failures)
   */
  public static checkInfrastructureAlerts(
    orgId?: string,
    customConfig?: Partial<InfraAlertConfig>
  ): Alert[] {
    const config: InfraAlertConfig = { ...this.defaultInfraConfig, ...customConfig };
    const firedAlerts: Alert[] = [];

    // 1. Check API Latency & Error Rates
    const apiMetrics = observabilityStore.getApiMetrics(undefined, orgId);
    for (const grp of apiMetrics) {
      if (grp.total_requests >= 5) {
        if (grp.error_rate > config.maxErrorRate) {
          const alertObj: Alert = {
            id: `alert_err_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            organization_id: orgId || 'org_system',
            title: `Infrastructure Alert: API Error Rate Spike on ${grp.endpoint_group}`,
            severity: 'critical',
            type: 'infrastructure_failure',
            body: `Endpoint group ${grp.endpoint_group} error rate reached ${(grp.error_rate * 100).toFixed(1)}% (max allowed: ${(config.maxErrorRate * 100).toFixed(0)}%).`,
            link: '/admin/ai-tasks',
            triggered_at: new Date().toISOString(),
            idempotency_key: `infra_err_${grp.endpoint_group}_${Date.now()}`,
          };

          alertsEngineStore.triggerAlert(alertObj, ['user_admin_ops']).catch(() => {});
          firedAlerts.push(alertObj);
        }

        if (grp.p95_ms > config.maxP95LatencyMs) {
          const alertObj: Alert = {
            id: `alert_lat_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            organization_id: orgId || 'org_system',
            title: `Infrastructure Alert: Latency Degradation on ${grp.endpoint_group}`,
            severity: 'medium',
            type: 'infrastructure_failure',
            body: `Endpoint group ${grp.endpoint_group} p95 latency reached ${grp.p95_ms}ms (max allowed: ${config.maxP95LatencyMs}ms).`,
            link: '/admin/ai-tasks',
            triggered_at: new Date().toISOString(),
            idempotency_key: `infra_lat_${grp.endpoint_group}_${Date.now()}`,
          };

          alertsEngineStore.triggerAlert(alertObj, ['user_admin_ops']).catch(() => {});
          firedAlerts.push(alertObj);
        }
      }
    }

    // 2. Check Integration Sync Failures
    const syncLogs = observabilityStore.getIntegrationSyncMetrics(undefined, orgId);
    if (syncLogs.length >= 5) {
      const failures = syncLogs.filter((m) => m.status === 'failure').length;
      const failureRate = failures / syncLogs.length;

      if (failureRate > config.maxIntegrationFailureRate) {
        const alertObj: Alert = {
          id: `alert_sync_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          organization_id: orgId || 'org_system',
          title: `Infrastructure Alert: Integration Sync Failure Rate Spike`,
          severity: 'high',
          type: 'infrastructure_failure',
          body: `Integration sync failure rate reached ${(failureRate * 100).toFixed(1)}% across ${syncLogs.length} sync operations.`,
          link: '/admin/ai-tasks',
          triggered_at: new Date().toISOString(),
          idempotency_key: `infra_sync_${Date.now()}`,
        };

        alertsEngineStore.triggerAlert(alertObj, ['user_admin_ops']).catch(() => {});
        firedAlerts.push(alertObj);
      }
    }

    return firedAlerts;
  }
}
