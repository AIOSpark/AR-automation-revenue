// AIOSpark Telemetry & Infrastructure Observability Store (Layer 29)
// Instruments API latency, error rates, AI token costs, agent execution failures, and integration sync metrics.
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export interface ApiMetricLog {
  id: string;
  endpoint_group: string; // e.g. "/api/auth", "/api/billing", "/api/intelligence"
  duration_ms: number;
  status_code: number;
  organization_id?: string | null;
  timestamp: string;
}

export interface ApiLatencyMetrics {
  endpoint_group: string;
  total_requests: number;
  error_count: number;
  error_rate: number; // 0.0 to 1.0
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

export interface AiReasoningMetricLog {
  id: string;
  invoice_id?: string | null;
  organization_id: string;
  model_version: string;
  duration_ms: number;
  tokens_used: number;
  cost_usd: number;
  timestamp: string;
}

export interface AgentExecutionMetricLog {
  id: string;
  agent_name: string;
  organization_id: string;
  status: 'success' | 'failure';
  error_message?: string | null;
  duration_ms: number;
  timestamp: string;
}

export interface IntegrationSyncMetricLog {
  id: string;
  adapter_type: string; // e.g. "zoho", "tally", "csv", "bank"
  organization_id: string;
  status: 'success' | 'failure';
  error_message?: string | null;
  timestamp: string;
}

export interface DataImportMetricLog {
  id: string;
  import_type: string; // e.g. "csv_batch", "erp_sync"
  organization_id: string;
  status: 'success' | 'failure';
  error_message?: string | null;
  timestamp: string;
}

export interface ActionExecutionMetricLog {
  id: string;
  approval_request_id: string;
  organization_id: string;
  action_type: string;
  status: 'success' | 'failure';
  error_message?: string | null;
  timestamp: string;
}

export interface CustomerUnitCost {
  organization_id: string;
  period: string; // YYYY-MM
  total_ai_calls: number;
  total_tokens: number;
  ai_cost_usd: number;
  estimated_infra_cost_usd: number;
  total_cost_usd: number;
}

class ObservabilityStore {
  private apiMetrics: ApiMetricLog[] = [];
  private aiMetrics: AiReasoningMetricLog[] = [];
  private agentMetrics: AgentExecutionMetricLog[] = [];
  private integrationMetrics: IntegrationSyncMetricLog[] = [];
  private importMetrics: DataImportMetricLog[] = [];
  private actionMetrics: ActionExecutionMetricLog[] = [];

  constructor() {
    const state = readSnapshot<Partial<{
      apiMetrics: ApiMetricLog[];
      aiMetrics: AiReasoningMetricLog[];
      agentMetrics: AgentExecutionMetricLog[];
      integrationMetrics: IntegrationSyncMetricLog[];
      importMetrics: DataImportMetricLog[];
      actionMetrics: ActionExecutionMetricLog[];
    }>>('observability');
    this.apiMetrics = state?.apiMetrics || [];
    this.aiMetrics = state?.aiMetrics || [];
    this.agentMetrics = state?.agentMetrics || [];
    this.integrationMetrics = state?.integrationMetrics || [];
    this.importMetrics = state?.importMetrics || [];
    this.actionMetrics = state?.actionMetrics || [];
  }

  private persist(): void {
    writeSnapshot('observability', {
      apiMetrics: this.apiMetrics,
      aiMetrics: this.aiMetrics,
      agentMetrics: this.agentMetrics,
      integrationMetrics: this.integrationMetrics,
      importMetrics: this.importMetrics,
      actionMetrics: this.actionMetrics,
    });
  }

  // --- API LATENCY & ERROR RATES ---
  public recordApiMetric(params: {
    endpoint_group: string;
    duration_ms: number;
    status_code: number;
    organization_id?: string | null;
  }): ApiMetricLog {
    const log: ApiMetricLog = {
      id: `api_met_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      endpoint_group: params.endpoint_group,
      duration_ms: params.duration_ms,
      status_code: params.status_code,
      organization_id: params.organization_id || null,
      timestamp: new Date().toISOString(),
    };
    this.apiMetrics.push(log);
    this.persist();
    return log;
  }

  public getApiMetrics(endpointGroup?: string, organizationId?: string): ApiLatencyMetrics[] {
    const scopedLogs = organizationId
      ? this.apiMetrics.filter((metric) => metric.organization_id === organizationId)
      : this.apiMetrics;
    const groups = endpointGroup
      ? [endpointGroup]
      : Array.from(new Set(scopedLogs.map((m) => m.endpoint_group)));

    return groups.map((grp) => {
      const logs = scopedLogs.filter((m) => m.endpoint_group === grp);
      if (logs.length === 0) {
        return {
          endpoint_group: grp,
          total_requests: 0,
          error_count: 0,
          error_rate: 0,
          p50_ms: 0,
          p95_ms: 0,
          p99_ms: 0,
        };
      }

      const sortedDurations = logs.map((m) => m.duration_ms).sort((a, b) => a - b);
      const errors = logs.filter((m) => m.status_code >= 400).length;

      const p50Idx = Math.floor(sortedDurations.length * 0.5);
      const p95Idx = Math.floor(sortedDurations.length * 0.95);
      const p99Idx = Math.floor(sortedDurations.length * 0.99);

      return {
        endpoint_group: grp,
        total_requests: logs.length,
        error_count: errors,
        error_rate: Number((errors / logs.length).toFixed(4)),
        p50_ms: sortedDurations[p50Idx] || 0,
        p95_ms: sortedDurations[p95Idx] || 0,
        p99_ms: sortedDurations[p99Idx] || 0,
      };
    });
  }

  // --- AI REASONING METRICS ---
  public recordAiReasoningMetric(params: {
    invoice_id?: string | null;
    organization_id: string;
    model_version?: string | null;
    duration_ms: number;
    tokens_used: number;
    cost_usd: number;
  }): AiReasoningMetricLog {
    const log: AiReasoningMetricLog = {
      id: `ai_met_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      invoice_id: params.invoice_id || null,
      organization_id: params.organization_id,
      model_version: params.model_version || 'AIOSpark-O2C-v1.4',
      duration_ms: params.duration_ms,
      tokens_used: params.tokens_used,
      cost_usd: params.cost_usd,
      timestamp: new Date().toISOString(),
    };
    this.aiMetrics.push(log);
    this.persist();
    return log;
  }

  public getAiMetrics(orgId?: string): AiReasoningMetricLog[] {
    if (orgId) return this.aiMetrics.filter((m) => m.organization_id === orgId);
    return [...this.aiMetrics];
  }

  // --- AGENT EXECUTION METRICS ---
  public recordAgentMetric(params: {
    agent_name: string;
    organization_id: string;
    status: 'success' | 'failure';
    error_message?: string | null;
    duration_ms?: number;
  }): AgentExecutionMetricLog {
    const log: AgentExecutionMetricLog = {
      id: `agent_met_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agent_name: params.agent_name,
      organization_id: params.organization_id,
      status: params.status,
      error_message: params.error_message || null,
      duration_ms: params.duration_ms ?? 0,
      timestamp: new Date().toISOString(),
    };
    this.agentMetrics.push(log);
    this.persist();
    return log;
  }

  public getAgentMetrics(agentName?: string, organizationId?: string): AgentExecutionMetricLog[] {
    return this.agentMetrics.filter((metric) =>
      (!agentName || metric.agent_name === agentName) && (!organizationId || metric.organization_id === organizationId)
    );
  }

  // --- INTEGRATION SYNC METRICS ---
  public recordIntegrationSyncMetric(params: {
    adapter_type: string;
    organization_id: string;
    status: 'success' | 'failure';
    error_message?: string | null;
  }): IntegrationSyncMetricLog {
    const log: IntegrationSyncMetricLog = {
      id: `int_met_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      adapter_type: params.adapter_type,
      organization_id: params.organization_id,
      status: params.status,
      error_message: params.error_message || null,
      timestamp: new Date().toISOString(),
    };
    this.integrationMetrics.push(log);
    this.persist();
    return log;
  }

  public getIntegrationSyncMetrics(adapterType?: string, organizationId?: string): IntegrationSyncMetricLog[] {
    return this.integrationMetrics.filter((metric) =>
      (!adapterType || metric.adapter_type === adapterType) && (!organizationId || metric.organization_id === organizationId)
    );
  }

  // --- DATA IMPORT METRICS ---
  public recordDataImportMetric(params: {
    import_type: string;
    organization_id: string;
    status: 'success' | 'failure';
    error_message?: string | null;
  }): DataImportMetricLog {
    const log: DataImportMetricLog = {
      id: `imp_met_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      import_type: params.import_type,
      organization_id: params.organization_id,
      status: params.status,
      error_message: params.error_message || null,
      timestamp: new Date().toISOString(),
    };
    this.importMetrics.push(log);
    this.persist();
    return log;
  }

  public getDataImportMetrics(): DataImportMetricLog[] {
    return [...this.importMetrics];
  }

  // --- ACTION EXECUTION METRICS ---
  public recordActionExecutionMetric(params: {
    approval_request_id: string;
    organization_id: string;
    action_type: string;
    status: 'success' | 'failure';
    error_message?: string | null;
  }): ActionExecutionMetricLog {
    const log: ActionExecutionMetricLog = {
      id: `act_met_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approval_request_id: params.approval_request_id,
      organization_id: params.organization_id,
      action_type: params.action_type,
      status: params.status,
      error_message: params.error_message || null,
      timestamp: new Date().toISOString(),
    };
    this.actionMetrics.push(log);
    this.persist();
    return log;
  }

  public getActionExecutionMetrics(): ActionExecutionMetricLog[] {
    return [...this.actionMetrics];
  }

  // --- UNIT ECONOMICS (COST PER CUSTOMER) ---
  public getCustomerUnitCost(organization_id: string, period?: string): CustomerUnitCost {
    const targetPeriod = period || new Date().toISOString().substring(0, 7); // YYYY-MM
    const orgAiLogs = this.aiMetrics.filter(
      (m) => m.organization_id === organization_id && m.timestamp.startsWith(targetPeriod)
    );

    const totalCalls = orgAiLogs.length;
    const totalTokens = orgAiLogs.reduce((acc, m) => acc + m.tokens_used, 0);
    const aiCostUSD = Number(orgAiLogs.reduce((acc, m) => acc + m.cost_usd, 0).toFixed(6));

    // Base estimated infra cost per tenant month ($1.50 flat per tenant + $0.001 per API call)
    const orgApiLogs = this.apiMetrics.filter(
      (m) => m.organization_id === organization_id && m.timestamp.startsWith(targetPeriod)
    );
    const infraCostUSD = Number((1.5 + orgApiLogs.length * 0.001).toFixed(4));
    const totalCostUSD = Number((aiCostUSD + infraCostUSD).toFixed(4));

    return {
      organization_id,
      period: targetPeriod,
      total_ai_calls: totalCalls,
      total_tokens: totalTokens,
      ai_cost_usd: aiCostUSD,
      estimated_infra_cost_usd: infraCostUSD,
      total_cost_usd: totalCostUSD,
    };
  }

  public clearAll(): void {
    this.apiMetrics = [];
    this.aiMetrics = [];
    this.agentMetrics = [];
    this.integrationMetrics = [];
    this.importMetrics = [];
    this.actionMetrics = [];
    deleteSnapshot('observability');
  }
}

export const observabilityStore = new ObservabilityStore();
