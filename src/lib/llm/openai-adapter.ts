// AIOSpark OpenAI-Compatible LLM Adapter (Layer 30)
// Uses native fetch to call OpenAI-compatible APIs (OpenAI, Azure OpenAI, Gemini, Mistral, etc.).
// API keys are read server-side from environment variables only.
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
import { LLMProviderAdapter } from './provider';

/**
 * Normalize OpenAI-compatible `message.content` into plain text.
 *
 * Some providers (notably Mistral Large 4) return an array of content parts
 * containing thinking and text blocks instead of a single string. Concatenate
 * text parts and ignore reasoning/thinking parts.
 */
export function normalizeMessageContent(content: unknown): string | null {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (typeof p.text === 'string') return p.text;
        }
        return '';
      })
      .join('');
    return text.length > 0 ? text : null;
  }

  if (content && typeof content === 'object') {
    const p = content as Record<string, unknown>;
    if (typeof p.text === 'string') return p.text;
  }

  return null;
}

export class OpenAICompatibleAdapter extends LLMProviderAdapter {
  readonly provider: LLMProvider;
  readonly model: string;
  readonly config: LLMProviderConfig;

  private apiKey: string | null;
  private baseURL: string | null;

  constructor(config: LLMProviderConfig) {
    super();
    this.config = config;
    this.provider = config.provider;
    this.model = config.model;

    // Read provider-specific API key from config, then from env vars.
    // Never fall back to OPENAI_API_KEY for non-OpenAI providers.
    this.apiKey = config.apiKey || null;
    if (!this.apiKey) {
      switch (config.provider) {
        case 'google':
          this.apiKey = process.env.GEMINI_API_KEY || null;
          break;
        case 'mistral':
          this.apiKey = process.env.MISTRAL_API_KEY || null;
          break;
        case 'openai':
          this.apiKey = process.env.OPENAI_API_KEY || null;
          break;
        default:
          this.apiKey = null;
      }
    }

    this.baseURL = config.baseURL || null;
    if (!this.baseURL) {
      switch (config.provider) {
        case 'google':
          this.baseURL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
          break;
        case 'mistral':
          this.baseURL = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1';
          break;
        case 'openai':
          this.baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
          break;
        default:
          this.baseURL = 'https://api.openai.com/v1';
      }
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  getCapabilities(): ModelCapability {
    return {
      supportsStructuredOutput: true,
      supportsToolCalling: true,
      maxContextTokens: 128000,
      maxOutputTokens: 4096,
    };
  }

  async invoke(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: 'text' | 'json_object' };
      toolChoice?: 'none' | 'required' | 'auto';
    },
    signal?: AbortSignal
  ): Promise<LLMInvocationResult<LLMResponse>> {
    const startMs = Date.now();

    if (!this.isConfigured()) {
      return {
        success: false,
        error: `${this.provider} API key is not configured. Set ${this.provider === 'google' ? 'GEMINI_API_KEY' : this.provider === 'mistral' ? 'MISTRAL_API_KEY' : 'OPENAI_API_KEY'} environment variable.`,
        errorCode: 'AUTH_ERROR',
        retryable: false,
      };
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2000,
    };

    if (options?.responseFormat) {
      payload.response_format = options.responseFormat;
    }

    if (options?.toolChoice) {
      payload.tool_choice = options.toolChoice;
    }

    let response: Response;
    try {
      // Normalize the base URL so a trailing slash (common for Gemini's
      // OpenAI-compatible endpoint) does not produce a double-slash path.
      const baseURL = (this.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
      response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error during LLM invocation',
        errorCode: 'NETWORK_ERROR',
        retryable: true,
      };
    }

    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let errorCode: LLMErrorCode = 'PROVIDER_ERROR';
      let retryable = false;

      const retryAfterHeader = response.headers.get('retry-after');
      let retryAfterMs: number | undefined;
      if (retryAfterHeader) {
        const seconds = Number(retryAfterHeader);
        if (Number.isFinite(seconds)) {
          retryAfterMs = Math.max(0, seconds * 1000);
        } else {
          const dateMs = Date.parse(retryAfterHeader);
          if (Number.isFinite(dateMs)) {
            retryAfterMs = Math.max(0, dateMs - Date.now());
          }
        }
      }

      const requestLimitHeader = response.headers.get('x-ratelimit-limit-req-minute');
      const quotaExhausted = requestLimitHeader !== null && Number(requestLimitHeader) === 0;

      if (response.status === 401 || response.status === 403) {
        errorCode = 'AUTH_ERROR';
        retryable = false;
      } else if (response.status === 429) {
        errorCode = 'RATE_LIMIT';
        // A quota of 0 requests/minute means the account cannot use this
        // model at all; retrying will never succeed.
        retryable = !quotaExhausted;
      } else if (response.status >= 500) {
        errorCode = 'PROVIDER_ERROR';
        retryable = true;
      } else if (response.status >= 400) {
        errorCode = 'PROVIDER_ERROR';
        retryable = false;
      }

      const quotaMessage = quotaExhausted
        ? ` Rate limit for this account is 0 requests/minute for model "${this.model}" (access is not enabled on this plan).`
        : '';

      return {
        success: false,
        error: `LLM provider error (${response.status}): ${errorBody}${quotaMessage}`,
        errorCode,
        retryable,
        retryAfterMs,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    if (!choices || choices.length === 0) {
      return {
        success: false,
        error: 'LLM provider returned no choices',
        errorCode: 'PROVIDER_ERROR',
        retryable: false,
      };
    }

    const choice = choices[0];
    const message = choice.message as Record<string, unknown> | undefined;
    const content = normalizeMessageContent(message?.content);

    const toolCalls: LLMResponse['toolCalls'] = [];
    const rawToolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
    if (rawToolCalls) {
      for (const tc of rawToolCalls) {
        toolCalls.push({
          id: String(tc.id || ''),
          type: 'function',
          function: {
            name: String((tc.function as Record<string, unknown>)?.name || ''),
            arguments: String((tc.function as Record<string, unknown>)?.arguments || '{}'),
          },
        });
      }
    }

    const usage = data.usage as Record<string, unknown> | undefined;
    const inputTokens = Number(usage?.prompt_tokens) || 0;
    const outputTokens = Number(usage?.completion_tokens) || 0;
    const totalTokens = Number(usage?.total_tokens) || inputTokens + outputTokens;

    const finishReason = (choice.finish_reason as LLMResponse['finishReason']) || 'stop';

    const responseObj: LLMResponse = {
      content,
      toolCalls,
      finishReason,
      model: String(data.model || this.model),
      provider: this.provider,
      inputTokens,
      outputTokens,
      totalTokens,
      latencyMs,
      raw: data,
    };

    return {
      success: true,
      data: undefined,
      response: responseObj,
      retryable: false,
    };
  }

  normalizeError(error: unknown): { message: string; code: LLMErrorCode; retryable: boolean } {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return { message: error.message, code: 'AUTH_ERROR', retryable: false };
      }
      if (error.message.includes('429')) {
        return { message: error.message, code: 'RATE_LIMIT', retryable: true };
      }
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        return { message: error.message, code: 'TIMEOUT', retryable: true };
      }
      if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
        return { message: error.message, code: 'NETWORK_ERROR', retryable: true };
      }
    }
    return { message: String(error), code: 'UNKNOWN', retryable: false };
  }
}
