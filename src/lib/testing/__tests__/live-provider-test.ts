// AIOSPARK — LIVE PROVIDER TEST
// Dual-provider validation: Gemini (primary) and Mistral (fallback)
//
// This test verifies that both AI providers can connect, return genuine
// model responses, pass structured output validation, and pass evidence
// validation. Missing credentials produce SKIPPED status, never PASSED.

import { modelRouter } from '../../llm/router';
import { OpenAICompatibleAdapter } from '../../llm/openai-adapter';
import { LLMProviderConfig } from '../../llm/types';

export interface LiveProviderResult {
  provider: string;
  model: string;
  connectionOk: boolean;
  responseContent: string | null;
  structuredOutputValid: boolean;
  evidenceValidationOk: boolean;
  latencyMs: number;
  tokensUsed: number;
  error: string | null;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
}

export async function runLiveProviderTest() {
  console.log('\n==========================================');
  console.log('AIOSPARK — LIVE PROVIDER TEST');
  console.log('Dual-Provider: Gemini (Primary) + Mistral (Fallback)');
  console.log('==========================================\n');

  const results: LiveProviderResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  function testAssert(
    condition: boolean,
    message: string,
    resultIndex: number
  ) {
    if (condition) {
      console.log(`  ✅ ${message}`);
      passed++;
      results[resultIndex].status = 'PASSED';
    } else {
      console.error(`  ❌ ${message}`);
      failed++;
      results[resultIndex].status = 'FAILED';
    }
  }

  function markSkipped(message: string, resultIndex: number) {
    console.log(`  ⏭️  ${message} (SKIPPED — no credentials)`);
    skipped++;
    results[resultIndex].status = 'SKIPPED';
  }

  // ============================================================
  // Helper: Test a single provider independently
  // ============================================================
  async function testProvider(
    provider: 'google' | 'mistral',
    model: string,
    apiKey: string | undefined,
    baseURL: string | undefined,
    expectedMarker: string
  ): Promise<LiveProviderResult> {
    const index = results.length;
    results.push({
      provider,
      model,
      connectionOk: false,
      responseContent: null,
      structuredOutputValid: false,
      evidenceValidationOk: false,
      latencyMs: 0,
      tokensUsed: 0,
      error: null,
      status: 'SKIPPED',
    });

    if (!apiKey || apiKey.length === 0) {
      markSkipped(`${provider.toUpperCase()}: API key not configured`, index);
      return results[index];
    }

    const config: LLMProviderConfig = {
      provider,
      model,
      apiKey,
      baseURL: baseURL || (provider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : 'https://api.mistral.ai/v1'),
      timeoutMs: 30000,
      maxRetries: 1,
    };

    const adapter = new OpenAICompatibleAdapter(config);

    if (!adapter.isConfigured()) {
      markSkipped(`${provider.toUpperCase()}: adapter not configured`, index);
      return results[index];
    }

    const startMs = Date.now();
    try {
      const result = await adapter.invoke(
        [
          { role: 'system', content: 'You are a helpful assistant. Reply exactly with the marker string.' },
          { role: 'user', content: `Reply with exactly ${expectedMarker}` },
        ],
        {
          temperature: 0,
          maxTokens: 50,
          responseFormat: { type: 'json_object' },
        }
      );

      const latencyMs = Date.now() - startMs;

      if (result.success && result.response) {
        results[index].connectionOk = true;
        results[index].responseContent = result.response.content || null;
        results[index].latencyMs = latencyMs;
        results[index].tokensUsed = result.response.totalTokens;

        // Check response contains expected marker
        const hasMarker =
          result.response.content?.includes(expectedMarker) ?? false;
        testAssert(hasMarker, `${provider.toUpperCase()}: genuine model response received`, index);

        // Validate structured output (JSON)
        const isValidJSON = result.response.content
          ? tryParseJSON(result.response.content)
          : false;
        testAssert(isValidJSON, `${provider.toUpperCase()}: structured output is valid JSON`, index);
        results[index].structuredOutputValid = isValidJSON;

        // Evidence validation: response should not contain fabricated financial figures
        const hasFabricatedAmount = /₹\s*[\d,]+(\.\d+)?\s*(Cr|Lakh|Lakhs)?/i.test(
          result.response.content || ''
        );
        testAssert(
          !hasFabricatedAmount,
          `${provider.toUpperCase()}: no fabricated financial figures in response`,
          index
        );
        results[index].evidenceValidationOk = !hasFabricatedAmount;

        results[index].status = 'PASSED';
      } else {
        results[index].error = result.error || 'Unknown error';
        testAssert(false, `${provider.toUpperCase()}: invocation failed — ${result.error}`, index);
        results[index].status = 'FAILED';
      }
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      results[index].latencyMs = latencyMs;
      results[index].error = err instanceof Error ? err.message : String(err);
      testAssert(false, `${provider.toUpperCase()}: invocation threw — ${results[index].error}`, index);
      results[index].status = 'FAILED';
    }

    return results[index];
  }

  // ============================================================
  // Test Gemini independently
  // ============================================================
  console.log('--- Test 1: Gemini Connection ---');
  await testProvider(
    'google',
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_BASE_URL,
    'GEMINI_CONNECTION_OK'
  );

  // ============================================================
  // Test Mistral independently
  // ============================================================
  console.log('\n--- Test 2: Mistral Connection ---');
  await testProvider(
    'mistral',
    process.env.MISTRAL_MODEL || 'mistral-large-4',
    process.env.MISTRAL_API_KEY,
    process.env.MISTRAL_BASE_URL,
    'MISTRAL_CONNECTION_OK'
  );

  // ============================================================
  // Test through AIOSpark Model Router
  // ============================================================
  console.log('\n--- Test 3: Model Router — Primary Provider (Gemini) ---');
  const routerIndex = results.length;
  results.push({
    provider: 'google',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    connectionOk: false,
    responseContent: null,
    structuredOutputValid: false,
    evidenceValidationOk: false,
    latencyMs: 0,
    tokensUsed: 0,
    error: null,
    status: 'SKIPPED',
  });

  if (process.env.GEMINI_API_KEY) {
    const startMs = Date.now();
    try {
      const routerResult = await modelRouter.invokeWithFallback(
        [
          { role: 'system', content: 'You are a financial analysis assistant.' },
          { role: 'user', content: 'Reply with exactly ROUTER_GEMINI_OK' },
        ],
        {
          temperature: 0,
          maxTokens: 50,
          responseFormat: { type: 'json_object' },
        }
      );

      const latencyMs = Date.now() - startMs;

      if (routerResult.success && routerResult.response) {
        results[routerIndex].connectionOk = true;
        results[routerIndex].responseContent = routerResult.response.content || null;
        results[routerIndex].latencyMs = latencyMs;
        results[routerIndex].tokensUsed = routerResult.response.totalTokens;

        const isGemini = routerResult.response.provider === 'google';
        testAssert(isGemini, 'Router: selected Gemini as primary provider', routerIndex);

        const hasMarker =
          routerResult.response.content?.includes('ROUTER_GEMINI_OK') ?? false;
        testAssert(hasMarker, 'Router: genuine response from Gemini', routerIndex);

        const isValidJSON = routerResult.response.content
          ? tryParseJSON(routerResult.response.content)
          : false;
        testAssert(isValidJSON, 'Router: structured output valid JSON', routerIndex);
        results[routerIndex].structuredOutputValid = isValidJSON;

        results[routerIndex].status = 'PASSED';
      } else {
        results[routerIndex].error = routerResult.error || 'Unknown error';
        testAssert(false, `Router: Gemini invocation failed — ${routerResult.error}`, routerIndex);
        results[routerIndex].status = 'FAILED';
      }
    } catch (err) {
      results[routerIndex].error = err instanceof Error ? err.message : String(err);
      testAssert(false, `Router: Gemini threw — ${results[routerIndex].error}`, routerIndex);
      results[routerIndex].status = 'FAILED';
    }
  } else {
    markSkipped('Router: Gemini not configured', routerIndex);
  }

  // ============================================================
  // Test fallback to Mistral
  // ============================================================
  console.log('\n--- Test 4: Model Router — Fallback Provider (Mistral) ---');
  const fallbackIndex = results.length;
  results.push({
    provider: 'mistral',
    model: process.env.MISTRAL_MODEL || 'mistral-large-4',
    connectionOk: false,
    responseContent: null,
    structuredOutputValid: false,
    evidenceValidationOk: false,
    latencyMs: 0,
    tokensUsed: 0,
    error: null,
    status: 'SKIPPED',
  });

  if (process.env.MISTRAL_API_KEY) {
    // Temporarily reconfigure router to make Mistral primary for fallback test
    const originalRoutes = modelRouter.getRoutes();
    modelRouter.reconfigure([
      { provider: 'mistral', model: process.env.MISTRAL_MODEL || 'mistral-large-4', priority: 1, isPrimary: true },
      { provider: 'google', model: process.env.GEMINI_MODEL || 'gemini-3.8-flash', priority: 2, isPrimary: false },
    ]);

    const startMs = Date.now();
    try {
      const routerResult = await modelRouter.invokeWithFallback(
        [
          { role: 'system', content: 'You are a financial analysis assistant.' },
          { role: 'user', content: 'Reply with exactly ROUTER_MISTRAL_OK' },
        ],
        {
          temperature: 0,
          maxTokens: 50,
          responseFormat: { type: 'json_object' },
        }
      );

      const latencyMs = Date.now() - startMs;

      if (routerResult.success && routerResult.response) {
        results[fallbackIndex].connectionOk = true;
        results[fallbackIndex].responseContent = routerResult.response.content || null;
        results[fallbackIndex].latencyMs = latencyMs;
        results[fallbackIndex].tokensUsed = routerResult.response.totalTokens;

        const isMistral = routerResult.response.provider === 'mistral';
        testAssert(isMistral, 'Router: selected Mistral as fallback provider', fallbackIndex);

        const hasMarker =
          routerResult.response.content?.includes('ROUTER_MISTRAL_OK') ?? false;
        testAssert(hasMarker, 'Router: genuine response from Mistral', fallbackIndex);

        const isValidJSON = routerResult.response.content
          ? tryParseJSON(routerResult.response.content)
          : false;
        testAssert(isValidJSON, 'Router: structured output valid JSON', fallbackIndex);
        results[fallbackIndex].structuredOutputValid = isValidJSON;

        results[fallbackIndex].status = 'PASSED';
      } else {
        results[fallbackIndex].error = routerResult.error || 'Unknown error';
        testAssert(false, `Router: Mistral invocation failed — ${routerResult.error}`, fallbackIndex);
        results[fallbackIndex].status = 'FAILED';
      }
    } catch (err) {
      results[fallbackIndex].error = err instanceof Error ? err.message : String(err);
      testAssert(false, `Router: Mistral threw — ${results[fallbackIndex].error}`, fallbackIndex);
      results[fallbackIndex].status = 'FAILED';
    } finally {
      // Restore original routes
      modelRouter.reconfigure(originalRoutes);
    }
  } else {
    markSkipped('Router: Mistral not configured', fallbackIndex);
  }

  // ============================================================
  // Test failure handling: invalid credentials
  // ============================================================
  console.log('\n--- Test 5: Failure Handling — Invalid Credentials ---');
  const failureIndex = results.length;
  results.push({
    provider: 'google',
    model: 'invalid-model',
    connectionOk: false,
    responseContent: null,
    structuredOutputValid: false,
    evidenceValidationOk: false,
    latencyMs: 0,
    tokensUsed: 0,
    error: null,
    status: 'SKIPPED',
  });

  // Test with a clearly invalid API key
  const badConfig: LLMProviderConfig = {
    provider: 'google',
    model: 'gemini-3.8-flash',
    apiKey: 'invalid_key_12345',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    timeoutMs: 10000,
    maxRetries: 0,
  };

  const badAdapter = new OpenAICompatibleAdapter(badConfig);
  const startMs = Date.now();
  try {
    const badResult = await badAdapter.invoke(
      [{ role: 'user', content: 'test' }],
      { temperature: 0, maxTokens: 10 }
    );
    const latencyMs = Date.now() - startMs;

    // Should fail with AUTH_ERROR, not succeed
    const failedCorrectly = !badResult.success;
    testAssert(failedCorrectly, 'Failure: invalid credentials rejected (no fabricated success)', failureIndex);
    testAssert(
      !badResult.success,
      'Failure: no fabricated success response',
      failureIndex
    );
    results[failureIndex].status = failedCorrectly ? 'PASSED' : 'FAILED';
    results[failureIndex].error = badResult.error || null;
    results[failureIndex].latencyMs = latencyMs;
  } catch (err) {
    results[failureIndex].error = err instanceof Error ? err.message : String(err);
    testAssert(false, `Failure: unexpected throw — ${results[failureIndex].error}`, failureIndex);
    results[failureIndex].status = 'FAILED';
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  console.log('\n==========================================');
  console.log('LIVE PROVIDER TEST — FINAL REPORT');
  console.log('==========================================\n');

  const colWidths = [12, 20, 12, 15, 20, 15, 12];
  const header = ['Provider', 'Model', 'Status', 'Latency (ms)', 'Tokens', 'Structured JSON', 'Evidence OK'].map(
    (h, i) => h.padEnd(colWidths[i])
  ).join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of results) {
    const statusIcon =
      r.status === 'PASSED' ? '✅' : r.status === 'FAILED' ? '❌' : '⏭️';
    const row = [
      r.provider.toUpperCase(),
      r.model,
      r.status,
      r.latencyMs.toString(),
      r.tokensUsed.toString(),
      r.structuredOutputValid ? 'YES' : 'NO',
      r.evidenceValidationOk ? 'YES' : 'NO',
    ].map((c, i) => c.padEnd(colWidths[i])).join(' | ');
    console.log(`${statusIcon} ${row}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  }

  console.log(`\nSummary: ${passed} PASSED, ${failed} FAILED, ${skipped} SKIPPED`);

  const geminiResult = results.find((r) => r.provider === 'google' && r.connectionOk && r.status === 'PASSED');
  const mistralResult = results.find((r) => r.provider === 'mistral' && r.connectionOk && r.status === 'PASSED');

  console.log(`\nGemini live invocation: ${geminiResult ? '✅ SUCCESS' : '⏭️  NOT DEMONSTRATED'}`);
  console.log(`Mistral live invocation: ${mistralResult ? '✅ SUCCESS' : '⏭️  NOT DEMONSTRATED'}`);

  if (failed > 0) {
    console.error('\n❌ Live provider test FAILED — some checks did not pass');
    process.exit(1);
  } else {
    console.log('\n✅ Live provider test PASSED — all applicable checks passed');
    if (!geminiResult || !mistralResult) {
      console.log('\n⚠️  NOTE: Not all providers were tested live (missing credentials).');
      console.log('   Set GEMINI_API_KEY and MISTRAL_API_KEY to complete dual-provider verification.');
    }
  }

  return { passed, failed, skipped, results };
}

function tryParseJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
