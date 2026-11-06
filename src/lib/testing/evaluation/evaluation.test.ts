// AIOSPARK P1-2B — Live Comparative Model Benchmark Test Suite
// Runs the 100-case gold dataset through configured model providers
// with staged execution (smoke → pilot → full) and cost controls.
// Missing credentials produce SKIPPED, never PASSED.
// Each provider is invoked independently — no fallback substitution.
// Stages require explicit execution mode selection.

import { evaluationRunner } from './evaluation-runner';
import { DEFAULT_EVALUATION_CONFIG, BenchmarkExecutionMode } from './types';

export async function runEvaluationTestSuite(
  executionMode: BenchmarkExecutionMode = 'SEQUENTIAL'
) {
  const config: typeof DEFAULT_EVALUATION_CONFIG = {
    ...DEFAULT_EVALUATION_CONFIG,
    executionMode,
  };
  return evaluationRunner.runBenchmark(config);
}
