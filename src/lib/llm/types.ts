// AIOSpark LLM Provider Types (Layer 30)
// Core types for the model provider abstraction.

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'custom';

export type LLMErrorCode = 'AUTH_ERROR' | 'RATE_LIMIT' | 'TIMEOUT' | 'NETWORK_ERROR' | 'PROVIDER_ERROR' | 'VALIDATION_ERROR' | 'UNKNOWN';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  content: string | null;
  toolCalls: LLMToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  model: string;
  provider: LLMProvider;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  raw: Record<string, unknown>;
}

export interface LLMProviderConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface LLMInvocationResult<T = unknown> {
  success: boolean;
  data?: T;
  response?: LLMResponse;
  error?: string;
  errorCode?: LLMErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface ModelCapability {
  supportsStructuredOutput: boolean;
  supportsToolCalling: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface PromptTemplate {
  id: string;
  version: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  inputVariables: string[];
  outputSchema?: Record<string, unknown>;
  description?: string;
}

export interface LLMUsageRecord {
  invocationId: string;
  organizationId: string;
  agentId: string;
  taskId: string;
  provider: LLMProvider;
  model: string;
  promptId?: string;
  promptVersion?: string;
  promptHash?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number | null;
  latencyMs: number;
  status: 'success' | 'failure';
  errorCode?: string;
  timestamp: string;
}
