// AIOSPARK — OFFLINE ROUTER TEST
//
// Tests that work WITHOUT API credentials:
// - Adapter configuration for each provider
// - Primary provider selection
// - Fallback routing logic
// - Invalid credentials behavior
// - Provider switching
//
// These tests use controlled mock adapters and never make
// network requests.

import { LLMProviderAdapter } from '../../llm/provider';
import { OpenAICompatibleAdapter, normalizeMessageContent } from '../../llm/openai-adapter';
import { ModelRouter, defaultRouterConfig } from '../../llm/router';
import { parseAndValidateJSON, JSONSchema } from '../../llm/schema';
import { promptManager } from '../../llm/prompt-manager';
import { LLMProviderConfig, LLMProvider, LLMMessage, LLMResponse, LLMInvocationResult, ModelCapability, LLMErrorCode } from '../../llm/types';

export interface OfflineRouterResult {
  test: string;
  status: 'PASSED' | 'FAILED';
  detail: string;
}

export async function runOfflineRouterTest() {
  console.log('\n==========================================');
  console.log('AIOSPARK — OFFLINE ROUTER TEST');
  console.log('Adapter configuration and routing logic');
  console.log('(No API credentials required)\n');

  let passed = 0;
  let failed = 0;
  const results: OfflineRouterResult[] = [];

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ ${message}`);
      passed++;
      results.push({ test: message, status: 'PASSED', detail: '' });
    } else {
      console.error(`  ❌ ${message}`);
      failed++;
      results.push({ test: message, status: 'FAILED', detail: '' });
    }
  }

  // ============================================================
  // Mock adapter for offline testing
  // ============================================================
  class MockAdapter extends LLMProviderAdapter {
    readonly provider: LLMProvider;
    readonly model: string;
    readonly config: LLMProviderConfig;
    private configured: boolean;
    protected invokeCount: number;

    constructor(provider: LLMProvider, model: string, configured: boolean = true) {
      super();
      this.provider = provider;
      this.model = model;
      this.config = { provider, model };
      this.configured = configured;
      this.invokeCount = 0;
    }

    isConfigured(): boolean {
      return this.configured;
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
      options?: { temperature?: number; maxTokens?: number; responseFormat?: { type: 'text' | 'json_object' }; toolChoice?: 'none' | 'required' | 'auto' },
      signal?: AbortSignal
    ): Promise<LLMInvocationResult<LLMResponse>> {
      this.invokeCount++;
      const response: LLMResponse = {
        content: JSON.stringify({ status: 'ok', provider: this.provider }),
        toolCalls: [],
        finishReason: 'stop',
        model: this.model,
        provider: this.provider,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        latencyMs: 100,
        raw: {},
      };
      return {
        success: true,
        data: undefined,
        response,
        retryable: false,
      };
    }

    normalizeError(error: unknown): { message: string; code: LLMErrorCode; retryable: boolean } {
      return { message: String(error), code: 'UNKNOWN', retryable: false };
    }

    getInvokeCount(): number {
      return this.invokeCount;
    }

    resetInvokeCount(): void {
      this.invokeCount = 0;
    }
  }

  // ============================================================
  // Test 1: Gemini adapter configuration
  // ============================================================
  console.log('--- Test 1: Gemini Adapter Configuration ---');
  const geminiConfig: LLMProviderConfig = {
    provider: 'google',
    model: 'gemini-3.8-flash',
    apiKey: 'test-gemini-key',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  };
  const geminiAdapter = new OpenAICompatibleAdapter(geminiConfig);
  testAssert(geminiAdapter.isConfigured(), 'Gemini adapter is configured with API key');
  testAssert(geminiAdapter.provider === 'google', 'Gemini adapter reports provider as google');
  testAssert(geminiAdapter.model === 'gemini-3.8-flash', 'Gemini adapter reports correct model');

  // ============================================================
  // Test 2: Mistral adapter configuration
  // ============================================================
  console.log('\n--- Test 2: Mistral Adapter Configuration ---');
  const mistralConfig: LLMProviderConfig = {
    provider: 'mistral',
    model: 'mistral-large-4',
    apiKey: 'test-mistral-key',
    baseURL: 'https://api.mistral.ai/v1',
  };
  const mistralAdapter = new OpenAICompatibleAdapter(mistralConfig);
  testAssert(mistralAdapter.isConfigured(), 'Mistral adapter is configured with API key');
  testAssert(mistralAdapter.provider === 'mistral', 'Mistral adapter reports provider as mistral');
  testAssert(mistralAdapter.model === 'mistral-large-4', 'Mistral adapter reports correct model');

  // ============================================================
  // Test 3: Adapter without credentials is not configured
  // ============================================================
  console.log('\n--- Test 3: Missing Credentials ---');
  const noKeyConfig: LLMProviderConfig = {
    provider: 'google',
    model: 'gemini-3.8-flash',
  };
  const noKeyAdapter = new OpenAICompatibleAdapter(noKeyConfig);
  testAssert(!noKeyAdapter.isConfigured(), 'Adapter without API key is not configured');

  // ============================================================
  // Test 4: Router primary provider selection
  // ============================================================
  console.log('\n--- Test 4: Router Primary Provider Selection ---');
  const mockGemini = new MockAdapter('google', 'gemini-3.8-flash', true);
  const mockMistral = new MockAdapter('mistral', 'mistral-large-4', true);

  const testRouter = new ModelRouter({
    routes: [
      { provider: 'google', model: 'gemini-3.8-flash', priority: 1, isPrimary: true },
      { provider: 'mistral', model: 'mistral-large-4', priority: 2, isPrimary: false },
    ],
    defaultTimeoutMs: 30000,
    maxRetries: 1,
    baseRetryDelayMs: 1000,
    maxRetryDelayMs: 10000,
  });

  // Register mock adapters
  testRouter.registerAdapter('google:gemini-3.8-flash', mockGemini);
  testRouter.registerAdapter('mistral:mistral-large-4', mockMistral);

  const routes = testRouter.getRoutes();
  const primaryRoute = routes.find((r) => r.isPrimary);
  testAssert(primaryRoute !== undefined, 'Router has a primary route');
  testAssert(primaryRoute?.provider === 'google', 'Primary route is Gemini');
  testAssert(primaryRoute?.model === 'gemini-3.8-flash', 'Primary model is gemini-3.8-flash');

  // ============================================================
  // Test 5: Router fallback provider selection
  // ============================================================
  console.log('\n--- Test 5: Router Fallback Provider Selection ---');
  const fallbackRoute = routes.find((r) => !r.isPrimary);
  testAssert(fallbackRoute !== undefined, 'Router has a fallback route');
  testAssert(fallbackRoute?.provider === 'mistral', 'Fallback route is Mistral');
  testAssert(fallbackRoute?.model === 'mistral-large-4', 'Fallback model is mistral-large-4');

  // ============================================================
  // Test 6: Router selects primary when available
  // ============================================================
  console.log('\n--- Test 6: Router Selects Primary When Available ---');
  mockGemini.resetInvokeCount();
  mockMistral.resetInvokeCount();

  const primaryResult = await testRouter.invokeWithFallback(
    [{ role: 'user', content: 'test' }],
    { temperature: 0, maxTokens: 10 }
  );

  testAssert(primaryResult.success, 'Router invocation succeeds with primary provider');
  testAssert(mockGemini.getInvokeCount() === 1, 'Primary provider (Gemini) was invoked');
  testAssert(mockMistral.getInvokeCount() === 0, 'Fallback provider (Mistral) was NOT invoked when primary succeeded');

  // ============================================================
  // Test 7: Router falls back when primary fails
  // ============================================================
  console.log('\n--- Test 7: Router Falls Back When Primary Fails ---');
  const failingGemini = new MockAdapter('google', 'gemini-3.8-flash', true);
  // Override invoke to fail
  (failingGemini as any).invoke = async () => ({
    success: false,
    error: 'Provider unavailable',
    errorCode: 'PROVIDER_ERROR',
    retryable: true,
  });

  const fallbackRouter = new ModelRouter({
    routes: [
      { provider: 'google', model: 'gemini-3.8-flash', priority: 1, isPrimary: true },
      { provider: 'mistral', model: 'mistral-large-4', priority: 2, isPrimary: false },
    ],
    defaultTimeoutMs: 30000,
    maxRetries: 0,
    baseRetryDelayMs: 1000,
    maxRetryDelayMs: 10000,
  });
  fallbackRouter.registerAdapter('google:gemini-3.8-flash', failingGemini);
  fallbackRouter.registerAdapter('mistral:mistral-large-4', mockMistral);

  mockMistral.resetInvokeCount();
  const fallbackResult = await fallbackRouter.invokeWithFallback(
    [{ role: 'user', content: 'test' }],
    { temperature: 0, maxTokens: 10 }
  );

  testAssert(fallbackResult.success, 'Router succeeds via fallback when primary fails');
  testAssert(mockMistral.getInvokeCount() === 1, 'Fallback provider (Mistral) was invoked after primary failure');

  // ============================================================
  // Test 8: Router returns error when no provider configured
  // ============================================================
  console.log('\n--- Test 8: Router Returns Error When No Provider Configured ---');
  const emptyRouter = new ModelRouter({
    routes: [],
    defaultTimeoutMs: 30000,
    maxRetries: 0,
    baseRetryDelayMs: 1000,
    maxRetryDelayMs: 10000,
  });

  const emptyResult = await emptyRouter.invokeWithFallback(
    [{ role: 'user', content: 'test' }],
    { temperature: 0, maxTokens: 10 }
  );

  testAssert(!emptyResult.success, 'Router returns failure when no provider configured');
  testAssert(emptyResult.errorCode === 'AUTH_ERROR', 'Error code is AUTH_ERROR when no provider');

  // ============================================================
  // Test 9: Default router config uses correct models
  // ============================================================
  console.log('\n--- Test 9: Default Router Config ---');
  testAssert(defaultRouterConfig.routes.length === 2, 'Default config has 2 routes');
  const defaultPrimary = defaultRouterConfig.routes.find((r) => r.isPrimary);
  testAssert(defaultPrimary?.provider === 'google', 'Default primary provider is google');
  testAssert(defaultPrimary?.model === 'gemini-3.8-flash', 'Default primary model is gemini-3.8-flash');
  const defaultFallback = defaultRouterConfig.routes.find((r) => !r.isPrimary);
  testAssert(defaultFallback?.provider === 'mistral', 'Default fallback provider is mistral');
  testAssert(defaultFallback?.model === 'mistral-large-4', 'Default fallback model is mistral-large-4');

  // ============================================================
  // Test 10: Structured output parsing tolerates model formatting
  // ============================================================
  console.log('\n--- Test 10: Structured Output Parsing ---');
  const template = promptManager.get('invoice-investigation');
  const outputSchema = template?.outputSchema as JSONSchema | undefined;
  const sampleAnalysis = {
    conclusion: 'Payment blocked by a PO quantity mismatch',
    category: 'PO_MISMATCH',
    confidence: 0.9,
    evidence: [
      {
        label: 'Invoice Amount',
        value: 125000,
        comparisonLabel: 'PO Amount',
        comparisonValue: 100000,
        delta: '25000',
      },
    ],
    source: 'Invoice Investigation Agent v1.0.0',
    generatedAt: new Date().toISOString(),
  };

  testAssert(Boolean(outputSchema), 'Invoice investigation schema is registered');
  if (outputSchema) {
    const fenced = '```json\n' + JSON.stringify(sampleAnalysis) + '\n```';
    const fencedResult = parseAndValidateJSON(fenced, outputSchema);
    testAssert(fencedResult.success, 'Fenced JSON with numeric evidence values validates');

    const prefixed = 'Here is the result:\n' + JSON.stringify(sampleAnalysis);
    const prefixedResult = parseAndValidateJSON(prefixed, outputSchema);
    testAssert(prefixedResult.success, 'JSON prefixed with prose validates');
  }

  const mistralContent = normalizeMessageContent([
    { type: 'thinking', thinking: [{ type: 'text', text: 'Internal reasoning' }] },
    { type: 'text', text: '{"ok":true}' },
  ]);
  testAssert(mistralContent === '{"ok":true}', 'Content arrays concatenate text parts and ignore thinking');

  // ============================================================
  // Test 11: Pinned routes retry rate limits instead of failing over
  // ============================================================
  console.log('\n--- Test 11: Pinned Route Rate-Limit Retry ---');
  class RateLimitedAdapter extends MockAdapter {
    private failuresRemaining: number;

    constructor(provider: LLMProvider, model: string, failures: number) {
      super(provider, model, true);
      this.failuresRemaining = failures;
    }

    async invoke(
      messages: LLMMessage[],
      options?: { temperature?: number; maxTokens?: number; responseFormat?: { type: 'text' | 'json_object' }; toolChoice?: 'none' | 'required' | 'auto' },
      signal?: AbortSignal
    ): Promise<LLMInvocationResult<LLMResponse>> {
      if (this.failuresRemaining > 0) {
        this.failuresRemaining--;
        this.invokeCount++;
        return {
          success: false,
          data: undefined,
          error: 'Rate limit exceeded',
          errorCode: 'RATE_LIMIT',
          retryable: true,
        };
      }
      return super.invoke(messages, options, signal);
    }
  }

  const retryAdapter = new RateLimitedAdapter('mistral', 'mistral-small-2603', 2);
  const retryRouter = new ModelRouter({
    routes: [{ provider: 'mistral', model: 'mistral-small-2603', priority: 1, isPrimary: true }],
    defaultTimeoutMs: 1000,
    maxRetries: 2,
    baseRetryDelayMs: 0,
    maxRetryDelayMs: 0,
  });
  retryRouter.registerAdapter('mistral:mistral-small-2603', retryAdapter);

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const retryResult = await retryRouter.invokeWithFallback(
      [{ role: 'user', content: 'test' }],
      { provider: 'mistral', model: 'mistral-small-2603' }
    );
    testAssert(retryResult.success, 'Pinned route retries a rate limit and succeeds');
    testAssert(retryAdapter.getInvokeCount() === 3, 'Pinned route makes 3 attempts after 2 rate limits');
  } finally {
    Math.random = originalRandom;
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  console.log('\n==========================================');
  console.log('OFFLINE ROUTER TEST — FINAL REPORT');
  console.log('==========================================\n');
  console.log(`Summary: ${passed} PASSED, ${failed} FAILED`);

  if (failed > 0) {
    console.error('\n❌ Offline router test FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ Offline router test PASSED');
  }

  return { passed, failed, results };
}
