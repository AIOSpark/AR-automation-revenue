// AIOSPARK P1-2B — Benchmark Execution Safety
// Staged comparative model benchmark with cost protection,
// provider independence, and reproducibility tracking.
// Missing credentials produce SKIPPED, never PASSED.
// Each provider/model combination is invoked independently — no fallback substitution.
// Stages require explicit execution mode selection.

import { modelRouter } from '../../llm/router';
import { AgentExecutor } from '../../agents/executor';
import { promptManager } from '../../llm/prompt-manager';
import { udmStore } from '../../udm/store';
import {
  EvaluationCase,
  EvaluationConfig,
  DEFAULT_EVALUATION_CONFIG,
  ModelExecutionResult,
  ModelInvocationRecord,
  BenchmarkReport,
  ProviderComparisonResult,
  EvaluationDimension,
  EvaluationCategory,
  CaseScore,
  DecisionTableEntry,
  BenchmarkStage,
  BenchmarkStageConfig,
  BenchmarkExecutionMode,
  CostTrackingRecord,
  ReproducibilityRecord,
  InFlightCostReservation,
  DuplicateInvocationRecord,
  DecisionTableStatus,
  computeConfigHash,
  resolveModelTargets,
} from './types';
import { ScoringEngine } from './scoring-engine';
import { SafetyGateEngine } from './safety-gates';
import { GOLD_DATASET, GOLD_DATASET_COUNTS, getCasesByCategory, getCaseById } from './gold-dataset';
import { AIAnalysis } from '../../intelligence/ai-analysis-contract';
import { NextBestActionRecommendation } from '../../intelligence/next-best-action-engine';
import { LLMProvider } from '../../llm/types';

/* ============================================================================
   BENCHMARK RUNNER WITH SAFETY PROTECTIONS
   ============================================================================ */

export class EvaluationRunner {
  private scoringEngine = new ScoringEngine();
  private safetyGateEngine = new SafetyGateEngine();

  // Cost protection state
  private inFlightReservations: InFlightCostReservation[] = [];
  private costTrackingRecords: CostTrackingRecord[] = [];
  private duplicateInvocations: DuplicateInvocationRecord[] = [];
  private reservedCostUsd = 0;
  private completedCostUsd = 0;

  // Duplicate prevention
  private invokedCaseProviderMap: Map<string, Set<string>> = new Map(); // caseId -> Set of provider+model

  /* ------------------------------------------------------------------
     Run staged benchmark evaluation for all configured providers
     ------------------------------------------------------------------ */
  async runBenchmark(config: EvaluationConfig = DEFAULT_EVALUATION_CONFIG): Promise<BenchmarkReport> {
    // Reset state for fresh run
    this.inFlightReservations = [];
    this.costTrackingRecords = [];
    this.duplicateInvocations = [];
    this.reservedCostUsd = 0;
    this.completedCostUsd = 0;
    this.invokedCaseProviderMap = new Map();

    const evaluationId = `bench_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const configHash = computeConfigHash(config);

    console.log('\n==========================================');
    console.log('AIOSPARK P1-2B — BENCHMARK EXECUTION SAFETY');
    console.log('==========================================\n');

    console.log('Configuration:');
    console.log(`  Evaluation ID: ${evaluationId}`);
    console.log(`  Providers: ${config.providers.join(', ')}`);
    console.log(`  Models: ${JSON.stringify(config.models)}`);
    console.log(`  Execution Mode: ${config.executionMode}`);
    console.log(`  Dataset Version: ${config.datasetVersion}`);
    console.log(`  Prompt Version: ${config.promptVersion}`);
    console.log(`  Stages: ${config.stages.map((s) => `${s.stage} (${s.casesPerModel} cases, min ${s.minCasesForWinner} for winner)`).join(', ')}`);
    console.log(`  Max total cost: $${config.maxTotalCostUsd}`);
    console.log(`  Max concurrent invocations: ${config.maxConcurrentInvocations}`);
    console.log(`  Cost protection: ${config.enableCostProtection}`);
    console.log(`  Duplicate prevention: ${config.enableDuplicatePrevention}\n`);

    // Build model targets first. A target is a provider/model pair, not just a
    // provider: Mistral Large and Mistral Small share provider credentials but
    // must be benchmarked independently.
    const modelTargets = resolveModelTargets(config);
    const targetProviders = Array.from(new Set(modelTargets.map((t) => t.provider)));

    // Preflight: check provider configuration
    const providerConfigStatus: Record<string, boolean> = {};
    for (const provider of targetProviders) {
      providerConfigStatus[provider] = this.isProviderConfigured(provider);
      console.log(`  ${provider}: ${providerConfigStatus[provider] ? 'CONFIGURED' : 'NOT CONFIGURED (will be SKIPPED)'}`);
    }

    const anyConfigured = Object.values(providerConfigStatus).some((v) => v);
    if (!anyConfigured) {
      console.log('\n⚠️  No providers configured. All evaluations will be SKIPPED.');
      console.log('   Set GEMINI_API_KEY and/or MISTRAL_API_KEY to enable live benchmarking.\n');
    }

    // Determine which stages to run based on execution mode
    const stagesToRun = this.filterStagesByMode(config.stages, config.executionMode);
    console.log(`  Stages to run: ${stagesToRun.map((s) => s.stage).join(', ')}\n`);

    const providerResults: ProviderComparisonResult[] = [];
    const stagesCompleted: BenchmarkStage[] = [];
    let totalInvocations = 0;

    // Execute stages sequentially
    for (const stageConfig of stagesToRun) {
      console.log(`\n==========================================`);
      console.log(`STAGE: ${stageConfig.stage} (${stageConfig.casesPerModel} cases per model)`);
      console.log('==========================================\n');

      // Check cost budget before starting stage
      if (config.enableCostProtection && config.maxTotalCostUsd !== null) {
        const estimatedTotal = this.completedCostUsd + this.reservedCostUsd;
        if (estimatedTotal >= config.maxTotalCostUsd) {
          console.log(`\n⚠️  Cost budget reached (completed: $${this.completedCostUsd}, reserved: $${this.reservedCostUsd}, limit: $${config.maxTotalCostUsd}). Stopping benchmark.`);
          break;
        }
      }

      const stageCases = this.selectCasesForStage(stageConfig);
      console.log(`Selected ${stageCases.length} cases for ${stageConfig.stage} stage`);

      for (const { provider, modelId } of modelTargets) {
        if (!modelId) continue;

        if (!providerConfigStatus[provider]) {
          // Provider not configured — all cases skipped
          const skippedResult = this.createSkippedProviderResult(provider, modelId, stageCases.length, stageConfig.stage);
          const existingSkippedIdx = providerResults.findIndex((r) => r.provider === provider && r.modelId === modelId);
          if (existingSkippedIdx >= 0) {
            providerResults[existingSkippedIdx] = this.mergeProviderResults(
              providerResults[existingSkippedIdx],
              skippedResult
            );
          } else {
            providerResults.push(skippedResult);
          }
          continue;
        }

        console.log(`\n--- Running ${provider} (${modelId}) on ${stageConfig.stage} stage ---`);

        const stageResult = await this.runProviderStageEvaluation(
          provider,
          modelId,
          stageCases,
          config,
          stageConfig.stage
        );

        totalInvocations += stageResult.totalInvocations;
        this.completedCostUsd += stageResult.totalCostUsd ?? 0;

        // Merge or add provider result
        const existingIdx = providerResults.findIndex((r) => r.provider === provider && r.modelId === modelId);
        if (existingIdx >= 0) {
          providerResults[existingIdx] = this.mergeProviderResults(
            providerResults[existingIdx],
            stageResult
          );
        } else {
          providerResults.push(stageResult);
        }

        // Check cost budget after each provider
        if (config.enableCostProtection && config.maxTotalCostUsd !== null) {
          const estimatedTotal = this.completedCostUsd + this.reservedCostUsd;
          if (estimatedTotal >= config.maxTotalCostUsd) {
            console.log(`\n⚠️  Cost budget reached after ${provider}. Stopping benchmark.`);
            break;
          }
        }
      }

      stagesCompleted.push(stageConfig.stage);

      // Check cost budget after each stage
      if (config.enableCostProtection && config.maxTotalCostUsd !== null) {
        const estimatedTotal = this.completedCostUsd + this.reservedCostUsd;
        if (estimatedTotal >= config.maxTotalCostUsd) {
          console.log(`\n⚠️  Cost budget reached after ${stageConfig.stage} stage. Stopping benchmark.`);
          break;
        }
      }
    }

    // Generate decision table with safety checks
    const decisionTable = this.generateDecisionTable(providerResults, config);

    const report: BenchmarkReport = {
      evaluationId,
      timestamp,
      totalCases: GOLD_DATASET.length,
      stagesCompleted,
      executionMode: config.executionMode,
      providers: providerResults,
      decisionTable,
      safetyGateSummary: this.aggregateSafetyGateViolations(providerResults),
      recommendations: this.generateRecommendations(providerResults),
      limitations: this.generateLimitations(providerResults, stagesCompleted),
      totalCostUsd: this.completedCostUsd > 0 ? Math.round(this.completedCostUsd * 100) / 100 : null,
      totalInvocations,
      costTrackingRecords: this.costTrackingRecords,
      reproducibility: {
        datasetVersion: config.datasetVersion,
        promptVersion: config.promptVersion,
        modelIdentifier: JSON.stringify(config.models),
        evaluationConfigHash: configHash,
        invocationTimestamp: timestamp,
        scoringConfigHash: config.scoringConfigHash,
      },
      inFlightReservations: this.inFlightReservations,
      duplicateInvocations: this.duplicateInvocations,
    };

    this.printBenchmarkReport(report);
    return report;
  }

  /* ------------------------------------------------------------------
     Filter stages by execution mode
     ------------------------------------------------------------------ */
  private filterStagesByMode(stages: BenchmarkStageConfig[], mode: BenchmarkExecutionMode): BenchmarkStageConfig[] {
    switch (mode) {
      case 'SMOKE_ONLY':
        return stages.filter((s) => s.stage === 'SMOKE');
      case 'PILOT_ONLY':
        return stages.filter((s) => s.stage === 'PILOT');
      case 'FULL_ONLY':
        return stages.filter((s) => s.stage === 'FULL');
      case 'SEQUENTIAL':
      default:
        return stages;
    }
  }

  /* ------------------------------------------------------------------
     Select cases for a benchmark stage
     ------------------------------------------------------------------ */
  private selectCasesForStage(stageConfig: BenchmarkStageConfig): EvaluationCase[] {
    const { casesPerModel, caseSelection } = stageConfig;

    if (caseSelection === 'FIRST_N') {
      return GOLD_DATASET.slice(0, casesPerModel);
    }

    if (caseSelection === 'RANDOM') {
      const shuffled = [...GOLD_DATASET].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, casesPerModel);
    }

    // STRATIFIED: proportional selection from each category
    const categories: EvaluationCategory[] = [
      'INVOICE_DISCREPANCY',
      'OVERDUE_PAYMENT',
      'PO_MISMATCH',
      'PAYMENT_RECONCILIATION',
      'NEXT_BEST_ACTION',
    ];

    const selected: EvaluationCase[] = [];
    const casesPerCategory = Math.floor(casesPerModel / categories.length);
    const remainder = casesPerModel % categories.length;

    let remainingRemainder = remainder;
    for (const cat of categories) {
      const catCases = getCasesByCategory(cat);
      const take = casesPerCategory + (remainingRemainder > 0 ? 1 : 0);
      if (remainingRemainder > 0) remainingRemainder--;
      selected.push(...catCases.slice(0, Math.min(take, catCases.length)));
    }

    return selected.slice(0, casesPerModel);
  }

  /* ------------------------------------------------------------------
     Run evaluation for a single provider on a stage's cases
     ------------------------------------------------------------------ */
  private async runProviderStageEvaluation(
    provider: string,
    modelId: string,
    cases: EvaluationCase[],
    config: EvaluationConfig,
    stage: BenchmarkStage
  ): Promise<ProviderComparisonResult> {
    const caseScores: CaseScore[] = [];
    const latencies: number[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let costAvailable = true;
    let passedCases = 0;
    let failedCases = 0;
    let skippedCases = 0;

    const safetyGateCounts: Record<string, number> = {};
    const categoryScores: Record<string, { total: number; sum: number }> = {};

    for (const caseData of cases) {
      if (!categoryScores[caseData.category]) {
        categoryScores[caseData.category] = { total: 0, sum: 0 };
      }
      categoryScores[caseData.category].total++;

      // Duplicate prevention check
      if (config.enableDuplicatePrevention) {
        const providerModelKey = `${provider}:${modelId}`;
        const existingProviders = this.invokedCaseProviderMap.get(caseData.id) || new Set();
        if (existingProviders.has(providerModelKey)) {
          // Duplicate invocation detected
          this.duplicateInvocations.push({
            caseId: caseData.id,
            provider,
            modelId,
            firstInvocationId: `dup_${Date.now()}`,
            duplicateInvocationIds: [],
          });
          console.log(`    ⚠️  Duplicate invocation prevented: ${caseData.id} for ${provider}:${modelId}`);
          skippedCases++;
          caseScores.push({
            caseId: caseData.id,
            category: caseData.category,
            difficulty: caseData.difficulty,
            provider,
            modelId,
            overallScore: 0,
            dimensionScores: [],
            safetyGateViolations: [],
            passed: false,
            timestamp: new Date().toISOString(),
            errorMessage: 'Duplicate invocation prevented',
          });
          continue;
        }
        existingProviders.add(providerModelKey);
        this.invokedCaseProviderMap.set(caseData.id, existingProviders);
      }

      try {
        const executionResult = await this.executeCase(
          caseData,
          provider,
          modelId,
          config,
          stage
        );

        if (executionResult.status === 'SKIPPED') {
          skippedCases++;
          caseScores.push({
            caseId: caseData.id,
            category: caseData.category,
            difficulty: caseData.difficulty,
            provider,
            modelId,
            overallScore: 0,
            dimensionScores: [],
            safetyGateViolations: [],
            passed: false,
            timestamp: new Date().toISOString(),
            errorMessage: 'Provider not configured',
          });
          continue;
        }

        // LLM call failed — do not evaluate safety gate for financial amounts.
        // The model produced no output to validate.
        if (executionResult.status === 'FAILURE') {
          failedCases++;
          const errorMessage = executionResult.invocation.errorMessage || 'LLM invocation failed';
          console.error(`    ❌ ${provider} (${modelId}) failed on ${caseData.id}: ${errorMessage}`);
          caseScores.push({
            caseId: caseData.id,
            category: caseData.category,
            difficulty: caseData.difficulty,
            provider,
            modelId,
            overallScore: 0,
            dimensionScores: [],
            safetyGateViolations: [],
            passed: false,
            timestamp: new Date().toISOString(),
            errorMessage,
          });
          continue;
        }

        // Track cost
        latencies.push(executionResult.invocation.latencyMs);
        totalTokens += executionResult.invocation.outputTokens;
        if (executionResult.invocation.costUsd !== null) {
          totalCost += executionResult.invocation.costUsd;
        } else {
          costAvailable = false;
        }

        // Record cost tracking
        this.costTrackingRecords.push({
          provider,
          modelId,
          stage,
          caseId: caseData.id,
          invocationId: executionResult.invocation.invocationId,
          inputTokens: executionResult.invocation.inputTokens,
          outputTokens: executionResult.invocation.outputTokens,
          costUsd: executionResult.invocation.costUsd,
          latencyMs: executionResult.invocation.latencyMs,
          timestamp: executionResult.invocation.timestamp,
          status: executionResult.invocation.status,
        });

        const safetyGate = this.safetyGateEngine.evaluate(
          caseData,
          executionResult.aiAnalysis,
          executionResult.nextBestAction,
          executionResult.structuredOutputValid,
          executionResult.crossTenantEvidenceDetected,
          executionResult.financialAmountsMatchGroundTruth,
          executionResult.financialValidationErrors
        );

        for (const v of safetyGate.violations) {
          safetyGateCounts[v] = (safetyGateCounts[v] || 0) + 1;
        }

        const caseScore = this.scoringEngine.scoreCase(caseData, {
          aiAnalysis: executionResult.aiAnalysis,
          nextBestAction: executionResult.nextBestAction,
          structuredOutputValid: executionResult.structuredOutputValid,
          schemaErrors: executionResult.schemaErrors,
          evidenceReferencesValid: executionResult.evidenceReferencesValid,
          evidenceValidationErrors: executionResult.evidenceValidationErrors,
          crossTenantEvidenceDetected: executionResult.crossTenantEvidenceDetected,
          financialAmountsMatchGroundTruth: executionResult.financialAmountsMatchGroundTruth,
          financialValidationErrors: executionResult.financialValidationErrors,
        }, safetyGate);

        caseScore.provider = provider;
        caseScore.modelId = modelId;

        // Safety gate disqualification
        if (!safetyGate.passed) {
          failedCases++;
          caseScore.passed = false;
        } else if (caseScore.passed) {
          passedCases++;
        } else {
          failedCases++;
        }

        categoryScores[caseData.category].sum += caseScore.overallScore;
        caseScores.push(caseScore);
      } catch (err) {
        failedCases++;
        caseScores.push({
          caseId: caseData.id,
          category: caseData.category,
          difficulty: caseData.difficulty,
          provider,
          modelId,
          overallScore: 0,
          dimensionScores: [],
          safetyGateViolations: ['UNSUPPORTED_CONCLUSION'],
          passed: false,
          timestamp: new Date().toISOString(),
          errorMessage: err instanceof Error ? err.message : 'Unknown execution error',
        });
      }
    }

    // Calculate dimension averages
    const dimensionScores: Record<EvaluationDimension, number> = {
      EVIDENCE_ACCURACY: 0,
      FINANCIAL_REASONING: 0,
      ROOT_CAUSE_DIAGNOSIS: 0,
      NEXT_BEST_ACTION_QUALITY: 0,
      STRUCTURED_OUTPUT_VALIDITY: 0,
    } as Record<EvaluationDimension, number>;

    const dimensionCounts: Record<EvaluationDimension, number> = {
      EVIDENCE_ACCURACY: 0,
      FINANCIAL_REASONING: 0,
      ROOT_CAUSE_DIAGNOSIS: 0,
      NEXT_BEST_ACTION_QUALITY: 0,
      STRUCTURED_OUTPUT_VALIDITY: 0,
    } as Record<EvaluationDimension, number>;

    for (const cs of caseScores) {
      for (const ds of cs.dimensionScores) {
        const dim = ds.dimension as EvaluationDimension;
        dimensionScores[dim] += ds.score / ds.maxScore;
        dimensionCounts[dim]++;
      }
    }

    for (const dim of Object.keys(dimensionScores) as EvaluationDimension[]) {
      if (dimensionCounts[dim] > 0) {
        dimensionScores[dim] = Math.round((dimensionScores[dim] / dimensionCounts[dim]) * 100) / 100;
      }
    }

    // Category scores
    const categoryScoreMap: Record<string, number> = {};
    for (const [cat, data] of Object.entries(categoryScores)) {
      categoryScoreMap[cat] = data.total > 0 ? Math.round((data.sum / data.total) * 100) / 100 : 0;
    }

    // Latency percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    const totalCases = cases.length;
    const overallScore = caseScores.length > 0
      ? Math.round((caseScores.reduce((sum, cs) => sum + cs.overallScore, 0) / caseScores.length) * 100) / 100
      : 0;

    return {
      provider,
      modelId,
      totalCases,
      passedCases,
      failedCases,
      skippedCases,
      overallScore,
      dimensionScores,
      safetyGateViolations: safetyGateCounts,
      latencyP50Ms: p50,
      latencyP95Ms: p95,
      averageTokens: totalCases > 0 && totalTokens > 0 ? Math.round(totalTokens / totalCases) : null,
      totalCostUsd: costAvailable ? Math.round(totalCost * 100) / 100 : null,
      categoryScores: categoryScoreMap,
      caseScores,
      totalInvocations: cases.length,
    };
  }

  /* ------------------------------------------------------------------
     Merge results from multiple stages for the same provider
     ------------------------------------------------------------------ */
  private mergeProviderResults(
    existing: ProviderComparisonResult,
    newStage: ProviderComparisonResult
  ): ProviderComparisonResult {
    const totalCases = existing.totalCases + newStage.totalCases;
    const passedCases = existing.passedCases + newStage.passedCases;
    const failedCases = existing.failedCases + newStage.failedCases;
    const skippedCases = existing.skippedCases + newStage.skippedCases;

    // Weighted average for overall score
    const overallScore = totalCases > 0
      ? Math.round(((existing.overallScore * existing.totalCases) + (newStage.overallScore * newStage.totalCases)) / totalCases * 100) / 100
      : 0;

    // Merge dimension scores (weighted by case count)
    const dimensionScores: Record<EvaluationDimension, number> = {} as Record<EvaluationDimension, number>;
    const dimensionCounts: Record<EvaluationDimension, number> = {} as Record<EvaluationDimension, number>;

    for (const dim of Object.keys(existing.dimensionScores) as EvaluationDimension[]) {
      dimensionScores[dim] = existing.dimensionScores[dim] * existing.totalCases;
      dimensionCounts[dim] = existing.totalCases;
    }
    for (const dim of Object.keys(newStage.dimensionScores) as EvaluationDimension[]) {
      dimensionScores[dim] = (dimensionScores[dim] || 0) + newStage.dimensionScores[dim] * newStage.totalCases;
      dimensionCounts[dim] = (dimensionCounts[dim] || 0) + newStage.totalCases;
    }
    for (const dim of Object.keys(dimensionScores) as EvaluationDimension[]) {
      if (dimensionCounts[dim] > 0) {
        dimensionScores[dim] = Math.round((dimensionScores[dim] / dimensionCounts[dim]) * 100) / 100;
      }
    }

    // Merge safety gate violations
    const safetyGateViolations: Record<string, number> = {};
    for (const [k, v] of Object.entries(existing.safetyGateViolations)) {
      safetyGateViolations[k] = v;
    }
    for (const [k, v] of Object.entries(newStage.safetyGateViolations)) {
      safetyGateViolations[k] = (safetyGateViolations[k] || 0) + v;
    }

    // Merge latency (weighted average)
    const totalLatencyCases = existing.totalCases + newStage.totalCases;
    const latencyP50Ms = Math.round(
      ((existing.latencyP50Ms * existing.totalCases) + (newStage.latencyP50Ms * newStage.totalCases)) / totalLatencyCases
    );
    const latencyP95Ms = Math.round(
      ((existing.latencyP95Ms * existing.totalCases) + (newStage.latencyP95Ms * newStage.totalCases)) / totalLatencyCases
    );

    // Merge tokens
    const averageTokens =
      existing.averageTokens === null && newStage.averageTokens === null
        ? null
        : totalCases > 0
          ? Math.round(
              ((existing.averageTokens || 0) * existing.totalCases +
                (newStage.averageTokens || 0) * newStage.totalCases) /
                totalCases
            )
          : null;

    // Merge costs
    const totalCostUsd = existing.totalCostUsd !== null && newStage.totalCostUsd !== null
      ? Math.round((existing.totalCostUsd + newStage.totalCostUsd) * 100) / 100
      : null;

    // Merge category scores
    const categoryScores: Record<string, number> = {};
    const categoryCaseCounts: Record<string, number> = {};
    for (const [cat, score] of Object.entries(existing.categoryScores)) {
      categoryScores[cat] = score;
      categoryCaseCounts[cat] = 1;
    }
    for (const [cat, score] of Object.entries(newStage.categoryScores)) {
      if (categoryScores[cat] !== undefined) {
        categoryScores[cat] = Math.round(((categoryScores[cat] * categoryCaseCounts[cat]) + score) / (categoryCaseCounts[cat] + 1) * 100) / 100;
        categoryCaseCounts[cat]++;
      } else {
        categoryScores[cat] = score;
        categoryCaseCounts[cat] = 1;
      }
    }

    return {
      ...existing,
      totalCases,
      passedCases,
      failedCases,
      skippedCases,
      overallScore,
      dimensionScores,
      safetyGateViolations,
      latencyP50Ms,
      latencyP95Ms,
      averageTokens,
      totalCostUsd,
      categoryScores,
      caseScores: [...existing.caseScores, ...newStage.caseScores],
      totalInvocations: (existing.totalInvocations || 0) + newStage.totalInvocations,
    };
  }

  /* ------------------------------------------------------------------
     Create a skipped provider result
     ------------------------------------------------------------------ */
  private createSkippedProviderResult(
    provider: string,
    modelId: string,
    totalCases: number,
    stage: BenchmarkStage
  ): ProviderComparisonResult {
    return {
      provider,
      modelId,
      totalCases,
      passedCases: 0,
      failedCases: 0,
      skippedCases: totalCases,
      overallScore: 0,
      dimensionScores: {
        EVIDENCE_ACCURACY: 0,
        FINANCIAL_REASONING: 0,
        ROOT_CAUSE_DIAGNOSIS: 0,
        NEXT_BEST_ACTION_QUALITY: 0,
        STRUCTURED_OUTPUT_VALIDITY: 0,
      } as Record<EvaluationDimension, number>,
      safetyGateViolations: {} as Record<string, number>,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      averageTokens: null,
      totalCostUsd: null,
      categoryScores: {} as Record<EvaluationCategory, number>,
      caseScores: [],
      totalInvocations: 0,
    };
  }

  /* ------------------------------------------------------------------
     Execute a single case through a model
     ------------------------------------------------------------------ */
  private async executeCase(
    caseData: EvaluationCase,
    provider: string,
    modelId: string,
    config: EvaluationConfig,
    stage: BenchmarkStage
  ): Promise<{
    status: 'SUCCESS' | 'FAILURE' | 'SKIPPED';
    invocation: ModelInvocationRecord;
    aiAnalysis: AIAnalysis | null;
    nextBestAction: NextBestActionRecommendation | null;
    structuredOutputValid: boolean;
    schemaErrors: string[];
    evidenceReferencesValid: boolean;
    evidenceValidationErrors: string[];
    crossTenantEvidenceDetected: boolean;
    financialAmountsMatchGroundTruth: boolean;
    financialValidationErrors: string[];
  }> {
    const invocationId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startMs = Date.now();

    // Check if provider is configured
    if (!this.isProviderConfigured(provider)) {
      return {
        status: 'SKIPPED',
        invocation: {
          invocationId,
          provider,
          modelId,
          promptVersion: 'unknown',
          inputDataHash: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          costUsd: null,
          status: 'SKIPPED',
          errorMessage: 'Provider not configured',
          timestamp: new Date().toISOString(),
        },
        aiAnalysis: null,
        nextBestAction: null,
        structuredOutputValid: false,
        schemaErrors: ['Provider not configured'],
        evidenceReferencesValid: false,
        evidenceValidationErrors: ['Provider not configured'],
        crossTenantEvidenceDetected: false,
        financialAmountsMatchGroundTruth: false,
        financialValidationErrors: ['Provider not configured'],
      };
    }

    // Build reasoning context from UDM
    udmStore.setTenantContext(caseData.organizationId);

    // Insert source records into UDM
    udmStore.insertCustomer(caseData.sourceCustomer);
    udmStore.insertInvoice(caseData.sourceInvoice);
    if (caseData.sourcePayments) {
      for (const pay of caseData.sourcePayments) {
        udmStore.insertPayment(pay);
      }
    }
    if (caseData.sourceExceptions) {
      for (const exc of caseData.sourceExceptions) {
        udmStore.insertException(exc);
      }
    }
    if (caseData.sourceDisputes) {
      for (const disp of caseData.sourceDisputes) {
        udmStore.insertDispute(disp);
      }
    }

    // Get the investigation prompt template
    const template = promptManager.get('invoice-investigation');
    if (!template) {
      return {
        status: 'FAILURE',
        invocation: {
          invocationId,
          provider,
          modelId,
          promptVersion: 'unknown',
          inputDataHash: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - startMs,
          costUsd: null,
          status: 'FAILURE',
          errorMessage: 'Prompt template not found',
          timestamp: new Date().toISOString(),
        },
        aiAnalysis: null,
        nextBestAction: null,
        structuredOutputValid: false,
        schemaErrors: ['Prompt template not found'],
        evidenceReferencesValid: false,
        evidenceValidationErrors: ['Prompt template not found'],
        crossTenantEvidenceDetected: false,
        financialAmountsMatchGroundTruth: false,
        financialValidationErrors: ['Prompt template not found'],
      };
    }

    // Build evidence context
    const context = {
      invoice: caseData.sourceInvoice,
      customer: caseData.sourceCustomer,
      poReference: caseData.sourceInvoice.po_reference || null,
      deliveryReference: caseData.sourceInvoice.delivery_reference || null,
      disputes: caseData.sourceDisputes || [],
      recentPayments: caseData.sourcePayments || [],
      hasDataQualityFlag: false,
      dataQualityMessage: null,
    };

    const evidenceContext = this.buildEvidenceContext(context);
    const rendered = promptManager.render('invoice-investigation', {
      evidence_context: evidenceContext,
      invoice_number: context.invoice.number,
      customer_name: context.customer?.name || 'Unknown',
      amount_minor_units: context.invoice.amount_minor_units,
      due_date: context.invoice.due_date,
      status: context.invoice.status,
      po_reference: context.poReference || 'Not recorded',
      delivery_reference: context.deliveryReference || 'Not recorded',
      output_schema: JSON.stringify(template.outputSchema, null, 2),
    });

    if (!rendered) {
      return {
        status: 'FAILURE',
        invocation: {
          invocationId,
          provider,
          modelId,
          promptVersion: template.version,
          inputDataHash: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - startMs,
          costUsd: null,
          status: 'FAILURE',
          errorMessage: 'Prompt rendering failed',
          timestamp: new Date().toISOString(),
        },
        aiAnalysis: null,
        nextBestAction: null,
        structuredOutputValid: false,
        schemaErrors: ['Prompt rendering failed'],
        evidenceReferencesValid: false,
        evidenceValidationErrors: ['Prompt rendering failed'],
        crossTenantEvidenceDetected: false,
        financialAmountsMatchGroundTruth: false,
        financialValidationErrors: ['Prompt rendering failed'],
      };
    }

    // Invoke the model through the router — INDEPENDENT invocation, no fallback
    const modelResult = await AgentExecutor.callModel<AIAnalysis>(
      rendered.userPrompt,
      {
        outputSchema: template.outputSchema,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        organizationId: caseData.organizationId,
        agentId: 'Benchmark Agent',
        taskId: `bench_${caseData.id}`,
        promptId: template.id,
        promptVersion: template.version,
        promptHash: promptManager.getPromptHash('invoice-investigation') || undefined,
        provider: provider as LLMProvider,
        model: modelId,
      }
    );

    const latencyMs = Date.now() - startMs;

    if (!modelResult.result || modelResult.tokensUsed === 0) {
      // LLM unavailable — this is a failure, not a fabricated success
      // Do NOT mark as INCORRECT_FINANCIAL_AMOUNT — that's a different failure mode
      const failureReason =
        modelResult.error || 'LLM unavailable or returned empty result';
      return {
        status: 'FAILURE',
        invocation: {
          invocationId,
          provider,
          modelId,
          promptVersion: template.version,
          inputDataHash: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          costUsd: null,
          status: 'FAILURE',
          errorMessage: failureReason,
          timestamp: new Date().toISOString(),
        },
        aiAnalysis: null,
        nextBestAction: null,
        structuredOutputValid: false,
        schemaErrors: [failureReason],
        evidenceReferencesValid: false,
        evidenceValidationErrors: [failureReason],
        crossTenantEvidenceDetected: false,
        financialAmountsMatchGroundTruth: false,
        financialValidationErrors: [failureReason],
      };
    }

    const rawAnalysis = modelResult.result as AIAnalysis;

    // Validate structured output
    const schemaErrors: string[] = [];
    let structuredOutputValid = true;

    if (!rawAnalysis.conclusion || rawAnalysis.conclusion.length === 0) {
      structuredOutputValid = false;
      schemaErrors.push('Missing conclusion');
    }
    if (!rawAnalysis.category || rawAnalysis.category.length === 0) {
      structuredOutputValid = false;
      schemaErrors.push('Missing category');
    }
    if (typeof rawAnalysis.confidence !== 'number' || rawAnalysis.confidence < 0 || rawAnalysis.confidence > 1) {
      structuredOutputValid = false;
      schemaErrors.push('Invalid confidence value');
    }
    if (!Array.isArray(rawAnalysis.evidence) || rawAnalysis.evidence.length === 0) {
      structuredOutputValid = false;
      schemaErrors.push('Missing or empty evidence');
    }

    // Validate evidence against UDM
    const validatedEvidence = this.validateEvidenceAgainstUDM(
      rawAnalysis.evidence,
      context,
      caseData.organizationId
    );
    const evidenceReferencesValid = validatedEvidence.length > 0;
    const evidenceValidationErrors: string[] = [];
    if (!evidenceReferencesValid) {
      evidenceValidationErrors.push('No valid evidence references after UDM validation');
    }

    // Check for cross-tenant evidence
    const crossTenantEvidenceDetected = this.checkCrossTenantEvidence(
      rawAnalysis.evidence,
      caseData.organizationId
    );

    // Validate financial amounts — only when we have actual model output
    const financialAmountsMatchGroundTruth = this.validateFinancialAmounts(
      rawAnalysis,
      caseData.groundTruthFinancials
    );
    const financialValidationErrors: string[] = [];
    if (!financialAmountsMatchGroundTruth) {
      financialValidationErrors.push('Financial amounts do not match ground truth');
    }

    // Generate next-best-action using the NBA engine
    let nextBestAction: NextBestActionRecommendation | null = null;
    try {
      const { NextBestActionEngine } = await import('../../intelligence/next-best-action-engine');
      nextBestAction = NextBestActionEngine.evaluateCase(
        caseData.sourceInvoice.id,
        caseData.organizationId,
        'Finance Executive'
      );
    } catch (err) {
      // NBA engine failure is not a safety violation
    }

    return {
      status: 'SUCCESS',
      invocation: {
        invocationId,
        provider,
        modelId,
        promptVersion: template.version,
        inputDataHash: '',
        inputTokens: modelResult.tokensUsed,
        outputTokens: modelResult.tokensUsed,
        latencyMs,
        costUsd: modelResult.estimatedCostUSD || null,
        status: 'SUCCESS',
        errorMessage: undefined,
        timestamp: new Date().toISOString(),
      },
      aiAnalysis: {
        ...rawAnalysis,
        evidence: validatedEvidence,
        source: 'Benchmark Framework',
        generatedAt: new Date().toISOString(),
        modelVersion: modelResult.model || modelId,
      },
      nextBestAction,
      structuredOutputValid,
      schemaErrors,
      evidenceReferencesValid,
      evidenceValidationErrors,
      crossTenantEvidenceDetected,
      financialAmountsMatchGroundTruth,
      financialValidationErrors,
    };
  }

  /* ------------------------------------------------------------------
     Helper methods
     ------------------------------------------------------------------ */

  private isProviderConfigured(provider: string): boolean {
    switch (provider) {
      case 'google':
        return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 0);
      case 'mistral':
        // Mistral Large and Mistral Small share the same provider, endpoint, and credentials
        return Boolean(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 0);
      case 'openai':
        return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0);
      default:
        return false;
    }
  }

  private buildEvidenceContext(context: any): string {
    const lines: string[] = [];
    lines.push(`Invoice Number: ${context.invoice.number}`);
    lines.push(`Invoice Amount: ${(context.invoice.amount_minor_units / 100).toLocaleString('en-IN')} ${context.invoice.currency}`);
    lines.push(`Issue Date: ${context.invoice.issue_date}`);
    lines.push(`Due Date: ${context.invoice.due_date}`);
    lines.push(`Status: ${context.invoice.status}`);
    lines.push(`PO Reference: ${context.poReference || 'Not recorded'}`);
    lines.push(`Delivery Reference: ${context.deliveryReference || 'Not recorded'}`);

    if (context.customer) {
      lines.push(`Customer Name: ${context.customer.name}`);
      lines.push(`Customer Payment Terms: ${context.customer.payment_terms_days} days`);
      lines.push(`Customer Credit Limit: ${(context.customer.credit_limit_minor_units / 100).toLocaleString('en-IN')} ${context.customer.currency}`);
    }

    if (context.disputes && context.disputes.length > 0) {
      lines.push('Disputes:');
      for (const d of context.disputes) {
        lines.push(`  - ${d.reason} (Status: ${d.status})`);
      }
    }

    if (context.recentPayments && context.recentPayments.length > 0) {
      lines.push('Recent Payments:');
      for (const p of context.recentPayments) {
        lines.push(`  - ${p.date}: ${(p.amount_minor_units / 100).toLocaleString('en-IN')} ${p.currency}`);
      }
    }

    return lines.join('\n');
  }

  private validateEvidenceAgainstUDM(
    evidence: AIAnalysis['evidence'],
    context: any,
    orgId: string
  ): AIAnalysis['evidence'] {
    const validated: AIAnalysis['evidence'] = [];

    for (const item of evidence) {
      if (item.label.toLowerCase().includes('invoice') && item.value) {
        const invNum = String(item.value);
        if (invNum !== context.invoice.number) {
          continue;
        }
      }

      if (item.label.toLowerCase().includes('po') && item.value) {
        const poVal = String(item.value);
        if (context.poReference && poVal !== context.poReference) {
          continue;
        }
      }

      validated.push(item);
    }

    return validated;
  }

  private checkCrossTenantEvidence(
    evidence: AIAnalysis['evidence'],
    orgId: string
  ): boolean {
    for (const item of evidence) {
      if (typeof item.value === 'string') {
        const value = item.value;
        if (value.includes('org_') && !value.includes(orgId)) {
          return true;
        }
      }
    }
    return false;
  }

  private validateFinancialAmounts(
    analysis: AIAnalysis,
    groundTruth: any
  ): boolean {
    const analysisText = JSON.stringify(analysis).toLowerCase();

    const amountPattern = /₹?\s*[\d,]+(\.\d+)?/g;
    let match;
    while ((match = amountPattern.exec(analysisText)) !== null) {
      const extracted = parseFloat(match[0].replace(/[₹,\s]/g, ''));
      const expectedOutstanding = groundTruth.outstandingAmountMinorUnits / 100;
      const expectedTotal = groundTruth.totalInvoiceAmountMinorUnits / 100;
      const expectedPaid = groundTruth.paidAmountMinorUnits / 100;

      if (extracted > 1000 &&
          extracted !== expectedOutstanding &&
          extracted !== expectedTotal &&
          extracted !== expectedPaid) {
        return false;
      }
    }

    return true;
  }

  /* ------------------------------------------------------------------
     Decision table generation with INSUFFICIENT_DATA handling
     ------------------------------------------------------------------ */

  private generateDecisionTable(results: ProviderComparisonResult[], config: EvaluationConfig): DecisionTableEntry[] {
    const geminiResult = results.find((r) => r.provider === 'google' && r.skippedCases < r.totalCases);
    const mistralLargeResult = results.find((r) => r.provider === 'mistral' && r.modelId === 'mistral-large-4' && r.skippedCases < r.totalCases);
    const mistralSmallResult = results.find((r) => r.provider === 'mistral' && r.modelId === 'mistral-small-2603' && r.skippedCases < r.totalCases);

    const workloads: Array<{
      workload: string;
      criterion: string;
      categories: EvaluationCategory[];
    }> = [
      {
        workload: 'Invoice Extraction',
        criterion: 'Evidence accuracy and cost',
        categories: ['INVOICE_DISCREPANCY'],
      },
      {
        workload: 'PO Mismatch Diagnosis',
        criterion: 'Evidence accuracy',
        categories: ['PO_MISMATCH'],
      },
      {
        workload: 'Overdue Investigation',
        criterion: 'Root-cause accuracy',
        categories: ['OVERDUE_PAYMENT'],
      },
      {
        workload: 'Payment Reconciliation',
        criterion: 'Financial correctness',
        categories: ['PAYMENT_RECONCILIATION'],
      },
      {
        workload: 'Complex Recovery Strategy',
        criterion: 'Recommendation quality',
        categories: ['NEXT_BEST_ACTION'],
      },
    ];

    const table: DecisionTableEntry[] = [];

    for (const w of workloads) {
      // Use the first category for score lookup
      const category = w.categories[0];
      const geminiScore = geminiResult ? (geminiResult.categoryScores[category] ?? 0) : 0;
      const mistralLargeScore = mistralLargeResult ? (mistralLargeResult.categoryScores[category] ?? 0) : 0;
      const mistralSmallScore = mistralSmallResult ? (mistralSmallResult.categoryScores[category] ?? 0) : 0;

      const geminiCasesCompleted = geminiResult ? geminiResult.totalCases - geminiResult.skippedCases : 0;
      const mistralLargeCasesCompleted = mistralLargeResult ? mistralLargeResult.totalCases - mistralLargeResult.skippedCases : 0;
      const mistralSmallCasesCompleted = mistralSmallResult ? mistralSmallResult.totalCases - mistralSmallResult.skippedCases : 0;

      // Check safety disqualifications
      const safetyDisqualifiedProviders: string[] = [];
      for (const r of results) {
        if (Object.values(r.safetyGateViolations).some((v) => v > 0)) {
          safetyDisqualifiedProviders.push(`${r.provider}:${r.modelId}`);
        }
      }

      // Determine if we have sufficient data for a winner
      const minCasesForWinner = config.minCasesForWinner;
      const hasSufficientGeminiData = geminiCasesCompleted >= minCasesForWinner;
      const hasSufficientMistralLargeData = mistralLargeCasesCompleted >= minCasesForWinner;
      const hasSufficientMistralSmallData = mistralSmallCasesCompleted >= minCasesForWinner;

      const validScores = [
        { model: 'gemini-3.8-flash', provider: 'google', score: geminiScore, cases: geminiCasesCompleted },
        { model: 'mistral-large-4', provider: 'mistral', score: mistralLargeScore, cases: mistralLargeCasesCompleted },
        { model: 'mistral-small-2603', provider: 'mistral', score: mistralSmallScore, cases: mistralSmallCasesCompleted },
      ].filter((s) => s.score > 0 && s.cases >= minCasesForWinner && !safetyDisqualifiedProviders.includes(`${s.provider}:${s.model}`));

      let status: DecisionTableStatus = 'INSUFFICIENT_DATA';
      let winningModel: string | null = null;
      let winningProvider: string | null = null;

      if (validScores.length === 0) {
        // Check if any provider had cases but all were disqualified or insufficient
        const anyProviderHadCases = geminiCasesCompleted > 0 || mistralLargeCasesCompleted > 0 || mistralSmallCasesCompleted > 0;
        if (anyProviderHadCases) {
          status = 'NO_VALID_CANDIDATE';
        }
      } else {
        status = 'HAS_WINNER';
        validScores.sort((a, b) => b.score - a.score);
        winningModel = validScores[0].model;
        winningProvider = validScores[0].provider;
      }

      table.push({
        workload: w.workload,
        status,
        winningModel,
        winningProvider,
        selectionCriterion: w.criterion,
        geminiScore,
        mistralLargeScore,
        mistralSmallScore,
        geminiCostUsd: geminiResult?.totalCostUsd ?? null,
        mistralLargeCostUsd: mistralLargeResult?.totalCostUsd ?? null,
        mistralSmallCostUsd: mistralSmallResult?.totalCostUsd ?? null,
        geminiLatencyMs: geminiResult?.latencyP50Ms ?? 0,
        mistralLargeLatencyMs: mistralLargeResult?.latencyP50Ms ?? 0,
        mistralSmallLatencyMs: mistralSmallResult?.latencyP50Ms ?? 0,
        geminiCasesCompleted,
        mistralLargeCasesCompleted,
        mistralSmallCasesCompleted,
        safetyDisqualifiedProviders,
      });
    }

    return table;
  }

  /* ------------------------------------------------------------------
     Report generation
     ------------------------------------------------------------------ */

  private aggregateSafetyGateViolations(
    results: ProviderComparisonResult[]
  ): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const r of results) {
      for (const [k, v] of Object.entries(r.safetyGateViolations)) {
        summary[k] = (summary[k] || 0) + v;
      }
    }
    return summary;
  }

  private generateRecommendations(results: ProviderComparisonResult[]): string[] {
    const recommendations: string[] = [];

    const invokedProviders = results.filter((r) => r.skippedCases < r.totalCases);
    if (invokedProviders.length === 0) {
      recommendations.push('No providers were tested live. Configure API credentials to run live benchmarking.');
      return recommendations;
    }

    // Only recommend a provider if it has at least one passing case
    const providersWithPasses = invokedProviders.filter((r) => r.passedCases > 0);
    if (providersWithPasses.length === 0) {
      recommendations.push('All live provider invocations failed before producing a score. No winner recommended.');
      const firstError = invokedProviders
        .flatMap((r) => r.caseScores)
        .find((c) => c.errorMessage && c.errorMessage !== 'Provider not configured')?.errorMessage;
      if (firstError) {
        recommendations.push(`First observed error: ${firstError}`);
      }
      return recommendations;
    }

    const bestProvider = providersWithPasses.reduce((best, current) =>
      current.overallScore > best.overallScore ? current : best
    );

    recommendations.push(
      `Best overall provider: ${bestProvider.provider} (${bestProvider.modelId}) with score ${bestProvider.overallScore}`
    );

    for (const r of invokedProviders) {
      if (r.safetyGateViolations && Object.values(r.safetyGateViolations).some((v) => v > 0)) {
        recommendations.push(
          `${r.provider} (${r.modelId}) has ${Object.values(r.safetyGateViolations).reduce((a, b) => a + b, 0)} safety gate violation(s) — review before production use`
        );
      }
    }

    return recommendations;
  }

  private generateLimitations(
    results: ProviderComparisonResult[],
    stagesCompleted: BenchmarkStage[]
  ): string[] {
    const limitations: string[] = [];

    const skippedProviders = results.filter((r) => r.skippedCases === r.totalCases);
    if (skippedProviders.length > 0) {
      limitations.push(
        `Providers skipped (no credentials): ${skippedProviders.map((r) => `${r.provider}/${r.modelId}`).join(', ')}`
      );
    }

    const invokedWithoutPasses = results.filter(
      (r) => r.skippedCases < r.totalCases && r.passedCases === 0
    );
    if (invokedWithoutPasses.length > 0) {
      limitations.push(
        `Models invoked but with zero passing cases: ${invokedWithoutPasses.map((r) => `${r.provider}/${r.modelId}`).join(', ')}`
      );
    }

    if (!stagesCompleted.includes('FULL')) {
      limitations.push('Full benchmark not completed — results are from smoke/pilot stages only');
    }

    limitations.push('Evaluation uses synthetic data — real ERP data validation is pending');
    const allSkipped = results.every((r) => r.skippedCases === r.totalCases);
    if (allSkipped) {
      limitations.push('Live model invocation required for accurate scoring');
    }

    return limitations;
  }

  /* ------------------------------------------------------------------
     Print benchmark report
     ------------------------------------------------------------------ */

  private printBenchmarkReport(report: BenchmarkReport): void {
    console.log('\n==========================================');
    console.log('P1-2B LIVE COMPARATIVE MODEL BENCHMARK — FINAL REPORT');
    console.log('==========================================\n');

    console.log(`Evaluation ID: ${report.evaluationId}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Execution Mode: ${report.executionMode}`);
    console.log(`Total Cases: ${report.totalCases}`);
    console.log(`Stages Completed: ${report.stagesCompleted.join(', ')}`);
    console.log(`Total Invocations: ${report.totalInvocations}`);
    console.log(`Total Cost: $${report.totalCostUsd ?? 'N/A'}\n`);

    console.log('Reproducibility:');
    console.log(`  Dataset Version: ${report.reproducibility.datasetVersion}`);
    console.log(`  Prompt Version: ${report.reproducibility.promptVersion}`);
    console.log(`  Model Identifier: ${report.reproducibility.modelIdentifier}`);
    console.log(`  Config Hash: ${report.reproducibility.evaluationConfigHash}`);
    console.log(`  Scoring Config Hash: ${report.reproducibility.scoringConfigHash}\n`);

    for (const p of report.providers) {
      console.log(`--- ${p.provider.toUpperCase()} (${p.modelId}) ---`);
      console.log(`  Total Cases: ${p.totalCases}`);
      console.log(`  Passed: ${p.passedCases}`);
      console.log(`  Failed: ${p.failedCases}`);
      console.log(`  Skipped: ${p.skippedCases}`);
      console.log(`  Overall Score: ${p.overallScore}`);
      console.log(`  Latency P50: ${p.latencyP50Ms}ms`);
      console.log(`  Latency P95: ${p.latencyP95Ms}ms`);
      console.log(`  Average Tokens: ${p.averageTokens ?? 'N/A'}`);
      console.log(`  Total Cost: $${p.totalCostUsd ?? 'N/A'}`);
      const errors = Array.from(
        new Set(p.caseScores.map((c) => c.errorMessage).filter((e): e is string => Boolean(e)))
      );
      if (errors.length > 0) {
        console.log(`  Error: ${errors[0]}`);
      }
      console.log('');
    }

    console.log('DECISION TABLE:');
    console.log('==========================================');
    const header = ['Workload', 'Status', 'Winning Model', 'Criterion', 'Gemini', 'Mistral Large', 'Mistral Small'];
    console.log(header.map((h) => h.padEnd(22)).join(' | '));
    console.log('-'.repeat(180));
    for (const d of report.decisionTable) {
      console.log([
        d.workload.padEnd(22),
        d.status.padEnd(22),
        (d.winningModel || 'N/A').padEnd(22),
        d.selectionCriterion.padEnd(22),
        `G:${d.geminiScore.toFixed(2)}`.padEnd(22),
        `ML:${d.mistralLargeScore.toFixed(2)}`.padEnd(22),
        `MS:${d.mistralSmallScore.toFixed(2)}`.padEnd(22),
      ].join(' | '));
    }

    if (report.safetyGateSummary && Object.values(report.safetyGateSummary).some((v) => v > 0)) {
      console.log('\nSafety Gate Violations:');
      for (const [k, v] of Object.entries(report.safetyGateSummary)) {
        if (v > 0) {
          console.log(`  ${k}: ${v}`);
        }
      }
    }

    console.log('\nRecommendations:');
    for (const r of report.recommendations) {
      console.log(`  - ${r}`);
    }

    console.log('\nLimitations:');
    for (const l of report.limitations) {
      console.log(`  - ${l}`);
    }

    console.log('\n==========================================');
  }
}

export const evaluationRunner = new EvaluationRunner();
