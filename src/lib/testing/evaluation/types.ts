// AIOSPARK P1-1 — Intelligence Evaluation Framework Types
// Core types for the evaluation framework, gold dataset, scoring, and reporting.

import { Invoice, Customer, Payment, ExceptionRecord, Dispute } from '../../udm/types';
import { AIAnalysis } from '../../intelligence/ai-analysis-contract';
import { NextBestActionRecommendation } from '../../intelligence/next-best-action-engine';

/* ============================================================================
   EVALUATION CASE TYPES
   ============================================================================ */

export type EvaluationCategory =
  | 'INVOICE_DISCREPANCY'
  | 'OVERDUE_PAYMENT'
  | 'PO_MISMATCH'
  | 'PAYMENT_RECONCILIATION'
  | 'NEXT_BEST_ACTION';

export type EvaluationDifficulty = 'SIMPLE' | 'INTERMEDIATE' | 'COMPLEX';

export interface GroundTruthFinancials {
  totalInvoiceAmountMinorUnits: number;
  paidAmountMinorUnits: number;
  outstandingAmountMinorUnits: number;
  taxAmountMinorUnits: number;
  expectedActionableAmountMinorUnits: number;
}

export interface GroundTruthEvidence {
  // Evidence references that SHOULD appear in a correct diagnosis
  expectedEvidenceLabels: string[];
  // Evidence references that should NOT appear (fabricated)
  forbiddenEvidenceLabels: string[];
  // Invoice numbers that must match
  expectedInvoiceNumbers: string[];
  // PO references that must match
  expectedPoReferences: string[];
}

export interface GroundTruthDiagnosis {
  expectedCategory: string;
  expectedRootCause: string;
  expectedConfidenceMin: number;
  expectedConfidenceMax: number;
  expectedConclusionContains: string[];
  expectedConclusionExcludes: string[];
}

export interface GroundTruthAction {
  acceptableActionTypes: string[];
  acceptableActionLabels: string[];
  disallowedActionTypes: string[];
  expectedRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedApprovalRequired: boolean;
}

export interface EvaluationCase {
  id: string;
  title: string;
  description: string;
  category: EvaluationCategory;
  difficulty: EvaluationDifficulty;
  organizationId: string;

  // Source records (synthetic, inserted into UDM for the test)
  sourceCustomer: Customer;
  sourceInvoice: Invoice;
  sourcePayments?: Payment[];
  sourceExceptions?: ExceptionRecord[];
  sourceDisputes?: Dispute[];

  // Ground truth — verified expected outcomes
  groundTruthFinancials: GroundTruthFinancials;
  groundTruthEvidence: GroundTruthEvidence;
  groundTruthDiagnosis: GroundTruthDiagnosis;
  groundTruthAction: GroundTruthAction;

  // Metadata
  createdAt: string;
  tags: string[];
}

/* ============================================================================
   MODEL EXECUTION RESULT TYPES
   ============================================================================ */

export interface ModelInvocationRecord {
  invocationId: string;
  provider: string;
  modelId: string;
  promptVersion: string;
  inputDataHash: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number | null;
  status: 'SUCCESS' | 'FAILURE' | 'SKIPPED';
  errorMessage?: string;
  timestamp: string;
}

export interface ModelExecutionResult {
  caseId: string;
  provider: string;
  modelId: string;
  invocation: ModelInvocationRecord;

  // Raw model output
  aiAnalysis: AIAnalysis | null;
  nextBestAction: NextBestActionRecommendation | null;

  // Parsed and validated
  structuredOutputValid: boolean;
  schemaErrors: string[];

  // Evidence validation
  evidenceReferencesValid: boolean;
  evidenceValidationErrors: string[];
  crossTenantEvidenceDetected: boolean;

  // Financial validation
  financialAmountsMatchGroundTruth: boolean;
  financialValidationErrors: string[];

  timestamp: string;
}

/* ============================================================================
   SCORING TYPES
   ============================================================================ */

export type EvaluationDimension =
  | 'EVIDENCE_ACCURACY'
  | 'FINANCIAL_REASONING'
  | 'ROOT_CAUSE_DIAGNOSIS'
  | 'NEXT_BEST_ACTION_QUALITY'
  | 'STRUCTURED_OUTPUT_VALIDITY';

export interface DimensionScore {
  dimension: EvaluationDimension;
  score: number; // 0.0 to 1.0
  maxScore: number;
  details: string[];
  passed: boolean;
}

export interface CaseScore {
  caseId: string;
  category: EvaluationCategory;
  difficulty: EvaluationDifficulty;
  provider: string;
  modelId: string;
  overallScore: number; // 0.0 to 1.0
  dimensionScores: DimensionScore[];
  safetyGateViolations: string[];
  passed: boolean;
  timestamp: string;
  errorMessage?: string;
}

/* ============================================================================
   SAFETY GATE TYPES
   ============================================================================ */

export type SafetyGateViolation =
  | 'FABRICATED_FINANCIAL_FACT'
  | 'INVALID_EVIDENCE_ACCEPTED'
  | 'CROSS_TENANT_EVIDENCE_ACCESS'
  | 'UNAUTHORIZED_ACTION_PROPOSED'
  | 'APPROVAL_REQUIREMENT_BYPASSED'
  | 'INCORRECT_FINANCIAL_AMOUNT'
  | 'INVALID_STRUCTURED_RESPONSE_EXECUTABLE'
  | 'UNSUPPORTED_CONCLUSION';

export interface SafetyGateResult {
  passed: boolean;
  violations: SafetyGateViolation[];
  details: string[];
}

/* ============================================================================
   BENCHMARK TYPES (P1-2)
   ============================================================================ */

export type BenchmarkStage = 'SMOKE' | 'PILOT' | 'FULL';

export type BenchmarkExecutionMode = 'SMOKE_ONLY' | 'PILOT_ONLY' | 'FULL_ONLY' | 'SEQUENTIAL';

export interface BenchmarkStageConfig {
  stage: BenchmarkStage;
  casesPerModel: number;
  caseSelection: 'FIRST_N' | 'RANDOM' | 'STRATIFIED';
  minCasesForWinner: number;
  requiredDimensions: EvaluationDimension[];
}

export interface CostTrackingRecord {
  provider: string;
  modelId: string;
  stage: BenchmarkStage;
  caseId: string;
  invocationId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  timestamp: string;
  status: 'SUCCESS' | 'FAILURE' | 'SKIPPED';
}

export interface ReproducibilityRecord {
  datasetVersion: string;
  promptVersion: string;
  modelIdentifier: string;
  evaluationConfigHash: string;
  invocationTimestamp: string;
  scoringConfigHash: string;
}

export interface InFlightCostReservation {
  invocationId: string;
  provider: string;
  modelId: string;
  estimatedCostUsd: number | null;
  reservedAt: string;
}

export interface DuplicateInvocationRecord {
  caseId: string;
  provider: string;
  modelId: string;
  firstInvocationId: string;
  duplicateInvocationIds: string[];
}

export type DecisionTableStatus = 'HAS_WINNER' | 'INSUFFICIENT_DATA' | 'NO_VALID_CANDIDATE' | 'SAFETY_DISQUALIFIED';

export interface DecisionTableEntry {
  workload: string;
  status: DecisionTableStatus;
  winningModel: string | null;
  winningProvider: string | null;
  selectionCriterion: string;
  geminiScore: number;
  mistralLargeScore: number;
  mistralSmallScore: number;
  geminiCostUsd: number | null;
  mistralLargeCostUsd: number | null;
  mistralSmallCostUsd: number | null;
  geminiLatencyMs: number;
  mistralLargeLatencyMs: number;
  mistralSmallLatencyMs: number;
  geminiCasesCompleted: number;
  mistralLargeCasesCompleted: number;
  mistralSmallCasesCompleted: number;
  safetyDisqualifiedProviders: string[];
}

export interface BenchmarkReport {
  evaluationId: string;
  timestamp: string;
  totalCases: number;
  stagesCompleted: BenchmarkStage[];
  executionMode: BenchmarkExecutionMode;
  providers: ProviderComparisonResult[];
  decisionTable: DecisionTableEntry[];
  safetyGateSummary: Record<string, number>;
  recommendations: string[];
  limitations: string[];
  totalCostUsd: number | null;
  totalInvocations: number;
  costTrackingRecords: CostTrackingRecord[];
  reproducibility: ReproducibilityRecord;
  inFlightReservations: InFlightCostReservation[];
  duplicateInvocations: DuplicateInvocationRecord[];
}

/* ============================================================================
   COMPARATIVE REPORT TYPES
   ============================================================================ */

export interface ProviderComparisonResult {
  provider: string;
  modelId: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  overallScore: number;
  dimensionScores: Record<EvaluationDimension, number>;
  safetyGateViolations: Record<string, number>;
  latencyP50Ms: number;
  latencyP95Ms: number;
  averageTokens: number | null;
  totalCostUsd: number | null;
  categoryScores: Record<EvaluationCategory, number>;
  caseScores: CaseScore[];
  totalInvocations: number;
}

/* ============================================================================
   CONFIGURATION
   ============================================================================ */

export interface EvaluationConfig {
  providers: string[];
  models: Record<string, string>;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
  safetyGateEnabled: boolean;
  stages: BenchmarkStageConfig[];
  maxTotalCostUsd: number | null;
  maxConcurrentInvocations: number;
  executionMode: BenchmarkExecutionMode;
  datasetVersion: string;
  promptVersion: string;
  scoringConfigHash: string;
  enableCostProtection: boolean;
  enableDuplicatePrevention: boolean;
  minCasesForWinner: number;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  providers: ['google', 'mistral'],
  models: {
    google: 'gemini-3.8-flash',
    mistral: 'mistral-large-4',
    'mistral-small': 'mistral-small-2603',
  },
  temperature: 0.2,
  maxTokens: 2000,
  timeoutMs: 30000,
  maxRetries: 2,
  safetyGateEnabled: true,
  stages: [
    { stage: 'SMOKE', casesPerModel: 3, caseSelection: 'STRATIFIED', minCasesForWinner: 2, requiredDimensions: ['EVIDENCE_ACCURACY', 'FINANCIAL_REASONING'] },
    { stage: 'PILOT', casesPerModel: 10, caseSelection: 'STRATIFIED', minCasesForWinner: 5, requiredDimensions: ['EVIDENCE_ACCURACY', 'FINANCIAL_REASONING', 'ROOT_CAUSE_DIAGNOSIS'] },
    { stage: 'FULL', casesPerModel: 100, caseSelection: 'STRATIFIED', minCasesForWinner: 50, requiredDimensions: ['EVIDENCE_ACCURACY', 'FINANCIAL_REASONING', 'ROOT_CAUSE_DIAGNOSIS', 'NEXT_BEST_ACTION_QUALITY', 'STRUCTURED_OUTPUT_VALIDITY'] },
  ],
  maxTotalCostUsd: 50.00,
  maxConcurrentInvocations: 3,
  executionMode: 'SEQUENTIAL',
  datasetVersion: 'gold-dataset-v1.0',
  promptVersion: 'invoice-investigation-v1.0',
  scoringConfigHash: 'scoring-v1.0',
  enableCostProtection: true,
  enableDuplicatePrevention: true,
  minCasesForWinner: 2,
};

export function computeConfigHash(config: EvaluationConfig): string {
  const configStr = JSON.stringify({
    providers: config.providers,
    models: config.models,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    safetyGateEnabled: config.safetyGateEnabled,
    stages: config.stages,
    maxTotalCostUsd: config.maxTotalCostUsd,
    maxConcurrentInvocations: config.maxConcurrentInvocations,
    executionMode: config.executionMode,
    datasetVersion: config.datasetVersion,
    promptVersion: config.promptVersion,
    scoringConfigHash: config.scoringConfigHash,
    enableCostProtection: config.enableCostProtection,
    enableDuplicatePrevention: config.enableDuplicatePrevention,
    minCasesForWinner: config.minCasesForWinner,
  });
  let hash = 0;
  for (let i = 0; i < configStr.length; i++) {
    const char = configStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

export interface ModelTarget {
  key: string;
  provider: string;
  modelId: string;
}

/**
 * Expand a config's model map into provider/model targets.
 *
 * A models key may be a provider name ("google", "mistral") or a model-specific
 * key ("mistral-small"). Model-specific keys resolve back to their owning
 * provider so credentials and routing are shared, while each model is still
 * benchmarked independently.
 */
export function resolveModelTargets(config: EvaluationConfig): ModelTarget[] {
  return Object.entries(config.models)
    .filter(([, modelId]) => Boolean(modelId))
    .map(([key, modelId]) => {
      const provider =
        config.providers.find((p) => p === key) ??
        config.providers.find((p) => key.startsWith(`${p}-`) || key.startsWith(p)) ??
        key;
      return { key, provider, modelId };
    });
}
