// AIOSPARK P1-2C — Live Comparative Model Benchmark CLI
// Dedicated entry point for running staged model benchmarks.
// Usage:
//   npx tsx scripts/run-evaluation.ts --stage=smoke
//   npx tsx scripts/run-evaluation.ts --stage=pilot
//   npx tsx scripts/run-evaluation.ts --stage=full
//
// Requires GEMINI_API_KEY and/or MISTRAL_API_KEY environment variables.
// Missing credentials produce SKIPPED, never PASSED.

import { evaluationRunner } from '../src/lib/testing/evaluation/evaluation-runner';
import { DEFAULT_EVALUATION_CONFIG, BenchmarkExecutionMode, BenchmarkStage } from '../src/lib/testing/evaluation/types';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Load Next.js environment configuration so standalone scripts
// can access the same env vars as the Next.js application.
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

/* ============================================================================
   ARGUMENT PARSING
   ============================================================================ */

function parseArgs(argv: string[]): { stage: BenchmarkExecutionMode | null; help: boolean } {
  let stage: BenchmarkExecutionMode | null = null;
  let help = false;

  const stageMap: Record<string, BenchmarkExecutionMode> = {
    smoke: 'SMOKE_ONLY',
    pilot: 'PILOT_ONLY',
    full: 'FULL_ONLY',
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg.startsWith('--stage=')) {
      const value = arg.slice('--stage='.length);
      if (stageMap[value]) {
        stage = stageMap[value];
      } else {
        console.error(`Error: Invalid stage '${value}'. Use smoke, pilot, or full.`);
        process.exit(2);
      }
    } else if (arg.startsWith('--stage')) {
      console.error("Error: --stage requires a value (e.g. --stage=smoke)");
      process.exit(2);
    } else {
      console.error(`Error: Unknown argument '${arg}'`);
      process.exit(2);
    }
  }

  return { stage, help };
}

function printHelp(): void {
  console.log(`
AIOSPARK P1-2C — Live Comparative Model Benchmark CLI

Usage:
  npx tsx scripts/run-evaluation.ts --stage=smoke
  npx tsx scripts/run-evaluation.ts --stage=pilot
  npx tsx scripts/run-evaluation.ts --stage=full

Options:
  --stage=smoke   Run smoke test (3 cases per model, 9 invocations total)
  --stage=pilot   Run pilot evaluation (10 cases per model, 30 invocations total)
  --stage=full    Run full benchmark (100 cases per model, 300 invocations total)
  --help, -h      Show this help message

Environment variables:
  GEMINI_API_KEY       Google Gemini API key (required for Gemini evaluation)
  MISTRAL_API_KEY      Mistral API key (required for Mistral Large and Small)
  GEMINI_MODEL         Gemini model ID (default: gemini-3.8-flash)
  MISTRAL_MODEL        Mistral Large model ID (default: mistral-large-4)
  MISTRAL_SMALL_MODEL  Mistral Small model ID (default: mistral-small-2603)

Examples:
  # Smoke test - verify provider connectivity with 9 invocations
  npx tsx scripts/run-evaluation.ts --stage=smoke

  # Pilot evaluation - 30 invocations
  npx tsx scripts/run-evaluation.ts --stage=pilot

  # Full benchmark - 300 invocations
  npx tsx scripts/run-evaluation.ts --stage=full

Notes:
  - Missing credentials produce SKIPPED, never PASSED.
  - Each provider is invoked independently - no fallback substitution.
  - Cost protection is enabled with a $50 maximum budget.
  - Reports are saved to scripts/evaluation-reports/.
`);
}

/* ============================================================================
   MAIN EXECUTION
   ============================================================================ */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const stage = args.stage;

  if (!stage) {
    console.error('Error: --stage is required. Use --stage=smoke, --stage=pilot, or --stage=full.');
    printHelp();
    process.exit(2);
  }

  console.log(`AIOSPARK P1-2C — Live Comparative Model Benchmark`);
  console.log(`Stage: ${stage.toUpperCase()}`);
  console.log(`\nChecking credentials...\n`);

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 0);
  const hasMistralKey = Boolean(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 0);

  console.log(`  Gemini API key: ${hasGeminiKey ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
  console.log(`  Mistral API key: ${hasMistralKey ? 'CONFIGURED' : 'NOT CONFIGURED'}`);

  if (!hasGeminiKey && !hasMistralKey) {
    console.error('\nError: No provider credentials configured.');
    console.error('Set GEMINI_API_KEY and/or MISTRAL_API_KEY before running.');
    process.exit(1);
  }

  // Build configuration for the requested stage only
  const stageToModeMap: Record<BenchmarkExecutionMode, BenchmarkStage> = {
    SMOKE_ONLY: 'SMOKE',
    PILOT_ONLY: 'PILOT',
    FULL_ONLY: 'FULL',
    SEQUENTIAL: 'SMOKE', // SEQUENTIAL runs all stages, handled below
  };

  const stageConfig = {
    ...DEFAULT_EVALUATION_CONFIG,
    models: {
      google: process.env.GEMINI_MODEL || DEFAULT_EVALUATION_CONFIG.models.google,
      mistral: process.env.MISTRAL_MODEL || DEFAULT_EVALUATION_CONFIG.models.mistral,
      'mistral-small':
        process.env.MISTRAL_SMALL_MODEL || DEFAULT_EVALUATION_CONFIG.models['mistral-small'],
    },
    executionMode: stage,
    stages: stage === 'SEQUENTIAL'
      ? DEFAULT_EVALUATION_CONFIG.stages
      : DEFAULT_EVALUATION_CONFIG.stages.filter((s) => s.stage === stageToModeMap[stage]),
  };

  console.log(`\nConfiguration:`);
  console.log(`  Stage: ${stage}`);
  console.log(`  Cases per model: ${stageConfig.stages[0]?.casesPerModel ?? 'unknown'}`);
  console.log(`  Max total cost: $${stageConfig.maxTotalCostUsd}`);
  console.log(`  Max concurrent invocations: ${stageConfig.maxConcurrentInvocations}\n`);

  // Verify smoke stage has exactly 3 cases per model
  if (stage === 'SMOKE_ONLY') {
    const smokeConfig = stageConfig.stages[0];
    if (smokeConfig && smokeConfig.casesPerModel !== 3) {
      console.error(`Error: Smoke stage should have exactly 3 cases per model, got ${smokeConfig.casesPerModel}`);
      process.exit(1);
    }
    console.log(`  Smoke verification: 3 cases per model × 3 models = 9 invocations\n`);
  }

  try {
    const report = await evaluationRunner.runBenchmark(stageConfig);

    // Save report
    const reportDir = join(process.cwd(), 'scripts', 'evaluation-reports');
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }

    const reportFileName = `evaluation-${report.evaluationId}.json`;
    const reportPath = join(reportDir, reportFileName);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\nReport saved to: ${reportPath}`);

    // Print summary
    console.log(`\n==========================================`);
    console.log(`BENCHMARK SUMMARY`);
    console.log(`==========================================`);
    console.log(`Evaluation ID: ${report.evaluationId}`);
    console.log(`Stage: ${report.executionMode.toUpperCase()}`);
    console.log(`Total Invocations: ${report.totalInvocations}`);
    console.log(`Total Cost: $${report.totalCostUsd ?? 'N/A'}`);

    for (const p of report.providers) {
      console.log(`\n  ${p.provider.toUpperCase()} (${p.modelId}):`);
      console.log(`    Cases: ${p.totalCases} (${p.passedCases} passed, ${p.failedCases} failed, ${p.skippedCases} skipped)`);
      console.log(`    Score: ${p.overallScore}`);
      console.log(`    Latency P50: ${p.latencyP50Ms}ms`);
      console.log(`    Cost: $${p.totalCostUsd ?? 'N/A'}`);
      const errors = Array.from(
        new Set(p.caseScores.map((c) => c.errorMessage).filter((e): e is string => Boolean(e)))
      );
      if (errors.length > 0) {
        console.log(`    Error: ${errors[0]}`);
      }
    }

    console.log(`\nDecision Table:`);
    for (const d of report.decisionTable) {
      console.log(`  ${d.workload}: ${d.status} (${d.winningModel || 'N/A'})`);
    }

    // Exit with nonzero status if there were failures
    const totalFailures = report.providers.reduce((sum, p) => sum + p.failedCases, 0);
    const totalSkipped = report.providers.reduce((sum, p) => sum + p.skippedCases, 0);
    const totalPassed = report.providers.reduce((sum, p) => sum + p.passedCases, 0);

    console.log(`\nResults: ${totalPassed} passed, ${totalFailures} failed, ${totalSkipped} skipped`);

    if (totalFailures > 0) {
      console.error(`\nBenchmark completed with ${totalFailures} failure(s).`);
      process.exit(1);
    }

    if (totalPassed === 0 && totalSkipped > 0) {
      console.error(`\nNo providers were able to complete evaluations (all skipped). Check credentials.`);
      process.exit(1);
    }

    console.log(`\nBenchmark completed successfully.`);
    process.exit(0);
  } catch (err) {
    console.error(`\nBenchmark execution failed:`, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
