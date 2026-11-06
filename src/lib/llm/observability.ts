// AIOSpark LLM Observability (Layer 30)
// Token usage, cost tracking, and invocation metrics for LLM calls.

import { LLMUsageRecord } from './types';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

const SNAPSHOT_NAMESPACE = 'llm_usage';

export interface LLMUsageSnapshot {
  records: LLMUsageRecord[];
}

class LLMObservabilityStore {
  private records: LLMUsageRecord[] = [];

  constructor() {
    const state = readSnapshot<LLMUsageSnapshot>(SNAPSHOT_NAMESPACE);
    this.records = state?.records || [];
  }

  private persist(): void {
    writeSnapshot(SNAPSHOT_NAMESPACE, { records: this.records });
  }

  record(record: LLMUsageRecord): void {
    this.records.push(record);
    // Keep bounded history
    if (this.records.length > 10000) {
      this.records = this.records.slice(-10000);
    }
    this.persist();
  }

  getRecords(organizationId?: string): LLMUsageRecord[] {
    if (organizationId) {
      return this.records.filter((r) => r.organizationId === organizationId);
    }
    return [...this.records];
  }

  getUsageByOrganization(organizationId: string): {
    totalInvocations: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostUSD: number;
    successCount: number;
    failureCount: number;
  } {
    const orgRecords = this.records.filter((r) => r.organizationId === organizationId);
    return {
      totalInvocations: orgRecords.length,
      totalInputTokens: orgRecords.reduce((sum, r) => sum + r.inputTokens, 0),
      totalOutputTokens: orgRecords.reduce((sum, r) => sum + r.outputTokens, 0),
      totalTokens: orgRecords.reduce((sum, r) => sum + r.totalTokens, 0),
      totalCostUSD: orgRecords.reduce((sum, r) => sum + (r.estimatedCostUSD || 0), 0),
      successCount: orgRecords.filter((r) => r.status === 'success').length,
      failureCount: orgRecords.filter((r) => r.status === 'failure').length,
    };
  }

  clearAll(): void {
    this.records = [];
    deleteSnapshot(SNAPSHOT_NAMESPACE);
  }
}

export const llmObservabilityStore = new LLMObservabilityStore();

/**
 * Estimate cost in USD based on token counts and model pricing.
 * Returns null if pricing is unknown for the model.
 */
export function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  // Pricing per 1M tokens (input, output) - updated periodically
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
  };

  const pricingKey = Object.keys(pricing).find((key) => model.toLowerCase().includes(key.toLowerCase()));
  if (!pricingKey) return null;

  const p = pricing[pricingKey];
  const inputCost = (inputTokens / 1_000_000) * p.input;
  const outputCost = (outputTokens / 1_000_000) * p.output;
  return Number((inputCost + outputCost).toFixed(6));
}
