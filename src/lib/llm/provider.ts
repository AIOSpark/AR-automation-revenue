// AIOSpark LLM Provider Interface (Layer 30)
// Defines the contract that all model providers must implement.
// Server-only: API keys and provider configuration must never reach client bundles.
import './server-only';

import {
  LLMMessage,
  LLMProvider,
  LLMProviderConfig,
  LLMResponse,
  LLMInvocationResult,
  ModelCapability,
  LLMErrorCode,
} from './types';

export abstract class LLMProviderAdapter {
  abstract readonly provider: LLMProvider;
  abstract readonly model: string;
  abstract readonly config: LLMProviderConfig;

  /**
   * Check if the provider is configured with valid credentials.
   */
  abstract isConfigured(): boolean;

  /**
   * Get model capabilities.
   */
  abstract getCapabilities(): ModelCapability;

  /**
   * Invoke the model with a list of messages.
   */
  abstract invoke(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: 'text' | 'json_object' };
      toolChoice?: 'none' | 'required' | 'auto';
    },
    signal?: AbortSignal
  ): Promise<LLMInvocationResult<LLMResponse>>;

  /**
   * Normalize a provider-specific error into a standard LLMInvocationError.
   */
  abstract normalizeError(error: unknown): { message: string; code: LLMErrorCode; retryable: boolean };
}
