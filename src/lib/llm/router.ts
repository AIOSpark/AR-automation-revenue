// AIOSpark Model Router (Layer 30)
// Centralized model routing with primary/fallback selection, retry logic,
// and timeout handling.
// Server-only: API keys and provider configuration must never reach client bundles.
import 'server-only';

import {
  LLMMessage,
  LLMProvider,
  LLMProviderConfig,
  LLMResponse,
  LLMInvocationResult,
  ModelCapability,
  PromptTemplate,
  LLMErrorCode,
} from './types';
import { LLMProviderAdapter } from './provider';
import { OpenAICompatibleAdapter } from './openai-adapter';

export interface ModelRoute {
  provider: LLMProvider;
  model: string;
  priority: number; // lower = higher priority
  isPrimary: boolean;
}

export interface RouterConfig {
  routes: ModelRoute[];
  defaultTimeoutMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
}

export class ModelRouter {
  private adapters: Map<string, LLMProviderAdapter> = new Map();
  private routes: ModelRoute[];
  private config: RouterConfig;

  constructor(config: RouterConfig) {
    this.routes = config.routes;
    this.config = config;
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    for (const route of this.routes) {
      this.getOrCreateAdapter(route.provider, route.model);
    }
  }

  /**
   * Resolve an adapter for a specific provider/model pair, creating it on
   * demand so callers can target a model that is not in the default routes
   * (for example Mistral Small alongside Mistral Large).
   */
  private getOrCreateAdapter(
    provider: LLMProvider,
    model: string
  ): LLMProviderAdapter | null {
    const adapterKey = `${provider}:${model}`;
    const existing = this.adapters.get(adapterKey);
    if (existing) return existing;

    const config: LLMProviderConfig = {
      provider,
      model,
      timeoutMs: this.config.defaultTimeoutMs,
      maxRetries: this.config.maxRetries,
    };

    // Attach provider-specific API key and base URL from environment.
    // Each provider uses its own credentials - never share OPENAI_API_KEY.
    switch (provider) {
      case 'google':
        config.apiKey = process.env.GEMINI_API_KEY || undefined;
        config.baseURL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
        break;
      case 'mistral':
        config.apiKey = process.env.MISTRAL_API_KEY || undefined;
        config.baseURL = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1';
        break;
      case 'openai':
        config.apiKey = process.env.OPENAI_API_KEY || undefined;
        config.baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        break;
    }

    let adapter: LLMProviderAdapter | null;
    switch (provider) {
      case 'openai':
      case 'google':
      case 'mistral':
        adapter = new OpenAICompatibleAdapter(config);
        break;
      default:
        // Unknown provider - skip adapter creation.
        // invokeWithFallback will return an auth error gracefully
        // when no adapter is available for the route.
        return null;
    }
    this.adapters.set(adapterKey, adapter);
    return adapter;
  }

  /**
   * Get the best available adapter for a given capability requirement.
   * Tries primary first, then falls back through routes in priority order.
   */
  private getAvailableAdapter(
    requiredCapability?: keyof ModelCapability
  ): { adapter: LLMProviderAdapter; route: ModelRoute } | null {
    const sortedRoutes = [...this.routes].sort((a, b) => a.priority - b.priority);

    for (const route of sortedRoutes) {
      const adapterKey = `${route.provider}:${route.model}`;
      const adapter = this.adapters.get(adapterKey);
      if (!adapter) continue;

      if (!adapter.isConfigured()) continue;

      if (requiredCapability) {
        const caps = adapter.getCapabilities();
        if (!caps[requiredCapability]) continue;
      }

      return { adapter, route };
    }

    return null;
  }

  /**
   * Invoke the model with retry logic and fallback routing.
   */
  async invokeWithFallback(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: 'text' | 'json_object' };
      toolChoice?: 'none' | 'required' | 'auto';
      requiredCapability?: keyof ModelCapability;
      signal?: AbortSignal;
      provider?: LLMProvider;
      model?: string;
    }
  ): Promise<LLMInvocationResult<LLMResponse>> {
    // When a caller pins a provider/model, invoke only that route. This is
    // required for benchmark independence: no provider substitution or
    // fallback is allowed, because the result must belong to the model that
    // was actually requested.
    const pinnedRoute =
      options?.provider && options?.model
        ? {
            provider: options.provider,
            model: options.model,
            priority: 1,
            isPrimary: true,
          }
        : null;
    const sortedRoutes = pinnedRoute
      ? [pinnedRoute]
      : [...this.routes].sort((a, b) => a.priority - b.priority);
    const maxRetries = this.config.maxRetries;
    const baseDelay = this.config.baseRetryDelayMs;
    const maxDelay = this.config.maxRetryDelayMs;

    // Check if any route has a configured adapter
    const hasConfiguredRoute = sortedRoutes.some((route) => {
      const adapter = this.getOrCreateAdapter(route.provider, route.model);
      return adapter ? adapter.isConfigured() : false;
    });

    if (!hasConfiguredRoute) {
      return {
        success: false,
        error: 'No LLM provider is configured. Set GEMINI_API_KEY, MISTRAL_API_KEY, or OPENAI_API_KEY environment variable.',
        errorCode: 'AUTH_ERROR',
        retryable: false,
      };
    }

    let lastError: { message: string; code: LLMErrorCode; retryable: boolean } | null = null;

    for (const route of sortedRoutes) {
      const adapter = this.getOrCreateAdapter(route.provider, route.model);
      if (!adapter) continue;
      if (!adapter.isConfigured()) continue;

      if (options?.requiredCapability) {
        const caps = adapter.getCapabilities();
        if (!caps[options.requiredCapability]) continue;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => {
          controller.abort();
        }, this.config.defaultTimeoutMs);

        try {
          const result = await adapter.invoke(messages, options, controller.signal);
          clearTimeout(timeoutHandle);

          if (result.success) {
            return result;
          }

          lastError = {
            message: result.error || 'Unknown LLM error',
            code: result.errorCode || 'UNKNOWN',
            retryable: result.retryable,
          };

          // Classify the error to decide retry vs fallback vs immediate failure
          const shouldFailOver = this.shouldFailOverOnError(result.errorCode || 'UNKNOWN');

          // Authentication and configuration errors should NOT fail over.
          // Return immediately so the caller sees the configuration problem.
          if (result.errorCode === 'AUTH_ERROR' || result.errorCode === 'VALIDATION_ERROR') {
            return {
              success: false,
              error: result.error || 'Provider configuration error',
              errorCode: result.errorCode,
              retryable: false,
            };
          }

          // If not retryable, stop. For a pinned route there is nowhere to
          // fail over to, so retryable errors are retried in place instead of
          // breaking out of the attempt loop.
          if (!result.retryable || (!pinnedRoute && shouldFailOver)) {
            break;
          }

          // If this is the last attempt for this route, try next route
          if (attempt === maxRetries) {
            break;
          }

          // Exponential backoff with jitter before retry. Honor a provider's
          // Retry-After header when it supplies one.
          const delay = result.retryAfterMs !== undefined
            ? Math.min(result.retryAfterMs, maxDelay)
            : Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          const jitter = result.retryAfterMs !== undefined ? 0 : Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        } catch (err) {
          clearTimeout(timeoutHandle);
          const normalized = adapter.normalizeError(err);
          lastError = normalized;

          // Authentication and configuration errors should NOT fail over.
          if (normalized.code === 'AUTH_ERROR' || normalized.code === 'VALIDATION_ERROR') {
            return {
              success: false,
              error: normalized.message,
              errorCode: normalized.code,
              retryable: false,
            };
          }

          // If not retryable, stop. For a pinned route there is nowhere to
          // fail over to, so retryable errors are retried in place instead of
          // breaking out of the attempt loop.
          if (!normalized.retryable || (!pinnedRoute && this.shouldFailOverOnError(normalized.code))) {
            break;
          }

          // If this is the last attempt for this route, try next route
          if (attempt === maxRetries) {
            break;
          }

          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          const jitter = Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }
      }
    }

    // All routes exhausted
    return {
      success: false,
      error: lastError?.message || 'All LLM providers failed',
      errorCode: (lastError?.code || 'UNKNOWN') as LLMErrorCode,
      retryable: false,
    };
  }

  /**
   * Determine whether an error code should trigger failover to the next provider.
   *
   * Retryable transient errors (timeout, rate limit, 5xx) should fail over after
   * bounded retries. Authentication and configuration errors should NOT fail over.
   */
  private shouldFailOverOnError(errorCode: LLMErrorCode): boolean {
    switch (errorCode) {
      case 'TIMEOUT':
      case 'RATE_LIMIT':
      case 'NETWORK_ERROR':
      case 'PROVIDER_ERROR':
        return true;
      case 'AUTH_ERROR':
      case 'VALIDATION_ERROR':
      case 'UNKNOWN':
        return false;
      default:
        return false;
    }
  }

  /**
   * Get all configured routes.
   */
  getRoutes(): ModelRoute[] {
    return [...this.routes];
  }

  /**
   * Check if any provider is configured.
   */
  isAnyProviderConfigured(): boolean {
    return this.getAvailableAdapter() !== null;
  }

  /**
   * Register a custom adapter.
   */
  registerAdapter(key: string, adapter: LLMProviderAdapter): void {
    this.adapters.set(key, adapter);
  }

  /**
   * Reconfigure routes at runtime (backward compatibility for setLLMConfig).
   */
  reconfigure(routes: ModelRoute[]): void {
    this.routes = routes;
    this.adapters.clear();
    this.initializeAdapters();
  }
}

export const defaultRouterConfig: RouterConfig = {
  routes: [
    {
      provider: 'google',
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      priority: 1,
      isPrimary: true,
    },
    {
      provider: 'mistral',
      model: process.env.MISTRAL_MODEL || 'mistral-large-4',
      priority: 2,
      isPrimary: false,
    },
  ],
  defaultTimeoutMs: parseInt(process.env.AIOSPARK_LLM_TIMEOUT_MS || '30000', 10),
  maxRetries: parseInt(process.env.AIOSPARK_LLM_MAX_RETRIES || '2', 10),
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 10000,
};

export const modelRouter = new ModelRouter(defaultRouterConfig);
