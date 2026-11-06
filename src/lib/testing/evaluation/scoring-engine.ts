// AIOSPARK P1-1 — Evaluation Scoring Engine
// Independent scoring for model outputs against ground truth.
// Does not trust model-generated self-assessments.

import {
  EvaluationCase,
  CaseScore,
  DimensionScore,
  EvaluationDimension,
  SafetyGateResult,
  SafetyGateViolation,
  GroundTruthDiagnosis,
  GroundTruthAction,
  GroundTruthEvidence,
  GroundTruthFinancials,
} from './types';
import { AIAnalysis } from '../../intelligence/ai-analysis-contract';
import { NextBestActionRecommendation } from '../../intelligence/next-best-action-engine';

/* ============================================================================
   SCORING ENGINE
   ============================================================================ */

export class ScoringEngine {
  /* ------------------------------------------------------------------
     Score a single case execution
     ------------------------------------------------------------------ */
  scoreCase(
    caseData: EvaluationCase,
    executionResult: {
      aiAnalysis: AIAnalysis | null;
      nextBestAction: NextBestActionRecommendation | null;
      structuredOutputValid: boolean;
      schemaErrors: string[];
      evidenceReferencesValid: boolean;
      evidenceValidationErrors: string[];
      crossTenantEvidenceDetected: boolean;
      financialAmountsMatchGroundTruth: boolean;
      financialValidationErrors: string[];
    },
    safetyGate: SafetyGateResult
  ): CaseScore {
    const dimensionScores: DimensionScore[] = [];

    // A. Evidence Accuracy (30%)
    const evidenceScore = this.scoreEvidenceAccuracy(
      caseData,
      executionResult.aiAnalysis,
      executionResult.evidenceReferencesValid,
      executionResult.evidenceValidationErrors,
      executionResult.crossTenantEvidenceDetected
    );
    dimensionScores.push(evidenceScore);

    // B. Financial Reasoning (25%)
    const financialScore = this.scoreFinancialReasoning(
      caseData,
      executionResult.aiAnalysis,
      executionResult.financialAmountsMatchGroundTruth,
      executionResult.financialValidationErrors
    );
    dimensionScores.push(financialScore);

    // C. Root Cause Diagnosis (20%)
    const diagnosisScore = this.scoreRootCauseDiagnosis(
      caseData,
      executionResult.aiAnalysis
    );
    dimensionScores.push(diagnosisScore);

    // D. Next-Best-Action Quality (15%)
    const actionScore = this.scoreNextBestActionQuality(
      caseData,
      executionResult.nextBestAction,
      executionResult.aiAnalysis
    );
    dimensionScores.push(actionScore);

    // E. Structured Output Validity (10%)
    const structureScore = this.scoreStructuredOutputValidity(
      executionResult.structuredOutputValid,
      executionResult.schemaErrors
    );
    dimensionScores.push(structureScore);

    // Weighted overall score
    const weights: Record<EvaluationDimension, number> = {
      EVIDENCE_ACCURACY: 0.30,
      FINANCIAL_REASONING: 0.25,
      ROOT_CAUSE_DIAGNOSIS: 0.20,
      NEXT_BEST_ACTION_QUALITY: 0.15,
      STRUCTURED_OUTPUT_VALIDITY: 0.10,
    };

    let overallScore = 0;
    for (const ds of dimensionScores) {
      overallScore += (ds.score / ds.maxScore) * weights[ds.dimension];
    }

    const passed =
      overallScore >= 0.7 &&
      safetyGateViolationsLength(safetyGate) === 0;

    return {
      caseId: caseData.id,
      category: caseData.category,
      difficulty: caseData.difficulty,
      provider: '', // Set by caller
      modelId: '', // Set by caller
      overallScore: Math.round(overallScore * 100) / 100,
      dimensionScores,
      safetyGateViolations: safetyGate.violations,
      passed,
      timestamp: new Date().toISOString(),
    };
  }

  /* ------------------------------------------------------------------
     A. Evidence Accuracy — 30%
     ------------------------------------------------------------------ */
  private scoreEvidenceAccuracy(
    caseData: EvaluationCase,
    analysis: AIAnalysis | null,
    evidenceValid: boolean,
    evidenceErrors: string[],
    crossTenantDetected: boolean
  ): DimensionScore {
    const details: string[] = [];
    let score = 0;

    if (!analysis) {
      details.push('No AI analysis produced');
      return {
        dimension: 'EVIDENCE_ACCURACY',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    if (crossTenantDetected) {
      details.push('CRITICAL: Cross-tenant evidence detected');
      return {
        dimension: 'EVIDENCE_ACCURACY',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    if (!evidenceValid) {
      details.push(`Evidence validation failed: ${evidenceErrors.join(', ')}`);
      return {
        dimension: 'EVIDENCE_ACCURACY',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    // Check that expected evidence labels are present
    const expectedLabels = caseData.groundTruthEvidence.expectedEvidenceLabels;
    const foundLabels = analysis.evidence.map((e) => e.label.toLowerCase());
    let expectedFound = 0;
    for (const label of expectedLabels) {
      if (foundLabels.some((fl) => fl.includes(label.toLowerCase()))) {
        expectedFound++;
      }
    }
    const expectedCoverage = expectedLabels.length > 0 ? expectedFound / expectedLabels.length : 1;
    details.push(`Expected evidence coverage: ${(expectedCoverage * 100).toFixed(0)}% (${expectedFound}/${expectedLabels.length})`);

    // Check that forbidden labels are absent
    const forbiddenLabels = caseData.groundTruthEvidence.forbiddenEvidenceLabels;
    let forbiddenFound = 0;
    for (const label of forbiddenLabels) {
      if (foundLabels.some((fl) => fl.includes(label.toLowerCase()))) {
        forbiddenFound++;
        details.push(`FORBIDDEN evidence label found: ${label}`);
      }
    }

    // Check invoice number references match
    const expectedInvNumbers = caseData.groundTruthEvidence.expectedInvoiceNumbers;
    let invNumbersMatch = true;
    for (const num of expectedInvNumbers) {
      if (!analysis.evidence.some((e) => String(e.value).includes(num))) {
        invNumbersMatch = false;
        details.push(`Invoice number ${num} not referenced in evidence`);
      }
    }

    // Calculate score
    score = 100;
    score -= (1 - expectedCoverage) * 40; // Up to 40 points for missing expected evidence
    score -= forbiddenFound * 20; // 20 points per forbidden label
    score -= invNumbersMatch ? 0 : 20; // 20 points for missing invoice references
    score = Math.max(0, Math.min(100, Math.round(score)));

    details.push(`Final evidence accuracy score: ${score}/100`);

    return {
      dimension: 'EVIDENCE_ACCURACY',
      score,
      maxScore: 100,
      details,
      passed: score >= 70,
    };
  }

  /* ------------------------------------------------------------------
     B. Financial Reasoning — 25%
     ------------------------------------------------------------------ */
  private scoreFinancialReasoning(
    caseData: EvaluationCase,
    analysis: AIAnalysis | null,
    amountsMatch: boolean,
    financialErrors: string[]
  ): DimensionScore {
    const details: string[] = [];
    let score = 0;

    if (!analysis) {
      details.push('No AI analysis produced');
      return {
        dimension: 'FINANCIAL_REASONING',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    if (financialErrors.length > 0) {
      details.push(`Financial validation errors: ${financialErrors.join(', ')}`);
      return {
        dimension: 'FINANCIAL_REASONING',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    if (!amountsMatch) {
      details.push('Financial amounts do not match ground truth');
      return {
        dimension: 'FINANCIAL_REASONING',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    // Check that analysis doesn't contain fabricated amounts
    const gt = caseData.groundTruthFinancials;
    const analysisText = JSON.stringify(analysis).toLowerCase();

    // Look for the outstanding amount in evidence
    const outstandingStr = (gt.outstandingAmountMinorUnits / 100).toString();
    const hasOutstandingReference = analysis.evidence.some((e) =>
      String(e.value).includes(outstandingStr) ||
      String(e.comparisonValue || '').includes(outstandingStr)
    );

    details.push(`Outstanding amount referenced: ${hasOutstandingReference}`);
    details.push(`Amounts match ground truth: ${amountsMatch}`);

    score = amountsMatch ? 100 : 0;
    if (!hasOutstandingReference) score -= 30;
    score = Math.max(0, Math.min(100, Math.round(score)));

    details.push(`Final financial reasoning score: ${score}/100`);

    return {
      dimension: 'FINANCIAL_REASONING',
      score,
      maxScore: 100,
      details,
      passed: score >= 70,
    };
  }

  /* ------------------------------------------------------------------
     C. Root Cause Diagnosis — 20%
     ------------------------------------------------------------------ */
  private scoreRootCauseDiagnosis(
    caseData: EvaluationCase,
    analysis: AIAnalysis | null
  ): DimensionScore {
    const details: string[] = [];
    let score = 0;

    if (!analysis) {
      details.push('No AI analysis produced');
      return {
        dimension: 'ROOT_CAUSE_DIAGNOSIS',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    const gt = caseData.groundTruthDiagnosis;

    // Category match
    const categoryMatch = analysis.category === gt.expectedCategory;
    details.push(`Category: ${analysis.category} (expected: ${gt.expectedCategory}) - ${categoryMatch ? 'MATCH' : 'MISMATCH'}`);

    // Root cause contains expected text
    const rootCauseText = analysis.category;
    const rootCauseMatch = gt.expectedRootCause
      .toLowerCase()
      .split(' ')
      .some((word) => rootCauseText.toLowerCase().includes(word));
    details.push(`Root cause (category): ${rootCauseText} - ${rootCauseMatch ? 'MATCH' : 'MISMATCH'}`);

    // Conclusion contains expected phrases
    let conclusionMatches = 0;
    for (const phrase of gt.expectedConclusionContains) {
      if (analysis.conclusion.toLowerCase().includes(phrase.toLowerCase())) {
        conclusionMatches++;
      }
    }
    const conclusionCoverage = gt.expectedConclusionContains.length > 0
      ? conclusionMatches / gt.expectedConclusionContains.length
      : 1;
    details.push(`Conclusion coverage: ${(conclusionCoverage * 100).toFixed(0)}%`);

    // Conclusion excludes forbidden phrases
    let conclusionExcludesViolations = 0;
    for (const phrase of gt.expectedConclusionExcludes) {
      if (analysis.conclusion.toLowerCase().includes(phrase.toLowerCase())) {
        conclusionExcludesViolations++;
        details.push(`FORBIDDEN conclusion phrase: ${phrase}`);
      }
    }

    // Confidence within expected range
    const confidenceInRange =
      analysis.confidence >= gt.expectedConfidenceMin &&
      analysis.confidence <= gt.expectedConfidenceMax;
    details.push(`Confidence: ${analysis.confidence} (expected ${gt.expectedConfidenceMin}-${gt.expectedConfidenceMax}) - ${confidenceInRange ? 'IN RANGE' : 'OUT OF RANGE'}`);

    // Calculate score
    score = 0;
    if (categoryMatch) score += 35;
    if (rootCauseMatch) score += 25;
    score += Math.round(conclusionCoverage * 25);
    score -= conclusionExcludesViolations * 10;
    if (confidenceInRange) score += 15;
    score = Math.max(0, Math.min(100, score));

    details.push(`Final root cause diagnosis score: ${score}/100`);

    return {
      dimension: 'ROOT_CAUSE_DIAGNOSIS',
      score,
      maxScore: 100,
      details,
      passed: score >= 70,
    };
  }

  /* ------------------------------------------------------------------
     D. Next-Best-Action Quality — 15%
     ------------------------------------------------------------------ */
  private scoreNextBestActionQuality(
    caseData: EvaluationCase,
    nba: NextBestActionRecommendation | null,
    analysis: AIAnalysis | null
  ): DimensionScore {
    const details: string[] = [];
    let score = 0;

    if (!nba) {
      details.push('No next-best-action produced');
      return {
        dimension: 'NEXT_BEST_ACTION_QUALITY',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    const gt = caseData.groundTruthAction;

    // Action type match
    const actionTypeMatch = gt.acceptableActionTypes.includes(nba.actionType);
    details.push(`Action type: ${nba.actionType} (acceptable: ${gt.acceptableActionTypes.join(', ')}) - ${actionTypeMatch ? 'MATCH' : 'MISMATCH'}`);

    // Disallowed action check
    const disallowedUsed = gt.disallowedActionTypes.includes(nba.actionType);
    if (disallowedUsed) {
      details.push(`DISALLOWED action type used: ${nba.actionType}`);
    }

    // Risk level match
    const riskMatch = nba.risk === gt.expectedRiskLevel;
    details.push(`Risk: ${nba.risk} (expected: ${gt.expectedRiskLevel}) - ${riskMatch ? 'MATCH' : 'MISMATCH'}`);

    // Approval requirement match
    const approvalMatch = nba.approvalRequired === gt.expectedApprovalRequired;
    details.push(`Approval required: ${nba.approvalRequired} (expected: ${gt.expectedApprovalRequired}) - ${approvalMatch ? 'MATCH' : 'MISMATCH'}`);

    // Invoice reference match
    const invoiceRefMatch = nba.invoiceId === caseData.sourceInvoice.id;
    details.push(`Invoice reference: ${invoiceRefMatch ? 'MATCH' : 'MISMATCH'}`);

    // Calculate score
    score = 0;
    if (actionTypeMatch) score += 40;
    if (riskMatch) score += 25;
    if (approvalMatch) score += 20;
    if (invoiceRefMatch) score += 10;
    if (disallowedUsed) score -= 30;
    score = Math.max(0, Math.min(100, score));

    details.push(`Final next-best-action quality score: ${score}/100`);

    return {
      dimension: 'NEXT_BEST_ACTION_QUALITY',
      score,
      maxScore: 100,
      details,
      passed: score >= 70,
    };
  }

  /* ------------------------------------------------------------------
     E. Structured Output Validity — 10%
     ------------------------------------------------------------------ */
  private scoreStructuredOutputValidity(
    structuredOutputValid: boolean,
    schemaErrors: string[]
  ): DimensionScore {
    const details: string[] = [];
    let score = 0;

    if (!structuredOutputValid) {
      details.push(`Schema validation failed: ${schemaErrors.join(', ')}`);
      return {
        dimension: 'STRUCTURED_OUTPUT_VALIDITY',
        score: 0,
        maxScore: 100,
        details,
        passed: false,
      };
    }

    score = 100;
    details.push('Structured output passed schema validation');

    return {
      dimension: 'STRUCTURED_OUTPUT_VALIDITY',
      score,
      maxScore: 100,
      details,
      passed: true,
    };
  }
}

function safetyGateViolationsLength(safetyGate: SafetyGateResult): number {
  return safetyGate.violations.length;
}
