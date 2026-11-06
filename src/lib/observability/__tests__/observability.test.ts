// AIOSpark Layer 29 Observability & AI-Quality Feedback Loop Automated Test Suite

import assert from 'node:assert';
import { observabilityStore } from '../store';
import { aiQualityStore, TAXONOMY_CATEGORIES } from '../ai-quality';
import { ObservabilityAlertEngine } from '../alerts';
import { ModelValidationRunner } from '../model-validation';
import { approvalStore } from '../../approvals/store';

export async function runObservabilityTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 29 OBSERVABILITY TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_obs_test';
  observabilityStore.clearAll();
  aiQualityStore.clearAll();
  approvalStore.clearAll();

  // 1. LABELED OUTCOME PIPELINE & ACCURACY / OVERRIDE RATE CALCULATION TEST
  // Simulate 10 reviews for PO_MISMATCH: 7 approved, 2 rejected, 1 modified
  for (let i = 0; i < 7; i++) {
    aiQualityStore.recordOutcome({
      organization_id: testOrgId,
      category: 'PO_MISMATCH',
      confidence_at_time: 0.95,
      outcome: 'approved',
    });
  }
  for (let i = 0; i < 2; i++) {
    aiQualityStore.recordOutcome({
      organization_id: testOrgId,
      category: 'PO_MISMATCH',
      confidence_at_time: 0.92,
      outcome: 'rejected',
    });
  }
  aiQualityStore.recordOutcome({
    organization_id: testOrgId,
    category: 'PO_MISMATCH',
    confidence_at_time: 0.88,
    outcome: 'modified',
    modification_delta: { adjusted_quantity: 950 },
  });

  const poMetrics = aiQualityStore.getCategoryMetrics('PO_MISMATCH', testOrgId);
  assert.strictEqual(poMetrics.total_reviewed, 10, 'Total reviewed mismatch');
  assert.strictEqual(poMetrics.approved_unmodified, 7, 'Approved count mismatch');
  assert.strictEqual(poMetrics.rejected, 2, 'Rejected count mismatch');
  assert.strictEqual(poMetrics.modified, 1, 'Modified count mismatch');
  assert.strictEqual(poMetrics.accuracy_proxy, 0.7, 'Accuracy proxy mismatch (expected 0.7)');
  assert.strictEqual(poMetrics.human_override_rate, 0.3, 'Human override rate mismatch (expected 0.3)');

  console.log('⚡ [PASS] 1. Labeled-Outcome Pipeline: Calculated accuracy (70%) and override rate (30%) matching exact ground truth');

  // 2. CATEGORY BREAKDOWN ISOLATION TEST (Surfacing single underperforming category)
  // Seed 10 good categories with 100% approval
  for (const cat of TAXONOMY_CATEGORIES) {
    if (cat === 'GST_TAX_ISSUE') continue; // Poor performer
    for (let i = 0; i < 25; i++) {
      aiQualityStore.recordOutcome({
        organization_id: testOrgId,
        category: cat,
        confidence_at_time: 0.96,
        outcome: 'approved',
      });
    }
  }

  // Seed GST_TAX_ISSUE with 10 approved and 15 rejected/modified (60% override rate)
  for (let i = 0; i < 10; i++) {
    aiQualityStore.recordOutcome({
      organization_id: testOrgId,
      category: 'GST_TAX_ISSUE',
      confidence_at_time: 0.91,
      outcome: 'approved',
    });
  }
  for (let i = 0; i < 15; i++) {
    aiQualityStore.recordOutcome({
      organization_id: testOrgId,
      category: 'GST_TAX_ISSUE',
      confidence_at_time: 0.89,
      outcome: 'rejected',
    });
  }

  const aggregateSummary = aiQualityStore.getAggregateSummary(testOrgId);
  // Overall aggregate looks strong (~93% accuracy), but GST_TAX_ISSUE has 60% override rate
  assert.ok(aggregateSummary.overall_accuracy_proxy > 0.90, 'Overall aggregate should remain high');

  const gstMetrics = aggregateSummary.category_breakdown['GST_TAX_ISSUE'];
  assert.strictEqual(gstMetrics.human_override_rate, 0.6, 'GST_TAX_ISSUE override rate should be 60%');
  assert.ok(gstMetrics.human_override_rate > aggregateSummary.overall_override_rate, 'Single category underperformance isolated clearly');

  console.log('⚡ [PASS] 2. Category Isolation: Surfaced single poorly performing category (GST_TAX_ISSUE: 60% override rate) without being hidden by strong aggregate performance');

  // 3. AI-QUALITY DEGRADATION ALERT & MINIMUM SAMPLE SIZE TEST
  // Category 'CREDIT_ISSUE' has 4 total reviews: 3 rejected = 75% override rate (High rate, BUT sample size 4 < 20)
  for (let i = 0; i < 1; i++) {
    aiQualityStore.recordOutcome({
      organization_id: testOrgId,
      category: 'CREDIT_ISSUE',
      confidence_at_time: 0.85,
      outcome: 'approved',
    });
  }
  for (let i = 0; i < 3; i++) {
    aiQualityStore.recordOutcome({
      organization_id: testOrgId,
      category: 'CREDIT_ISSUE',
      confidence_at_time: 0.85,
      outcome: 'rejected',
    });
  }

  // Check alerts with min sample size = 20
  const alertsInsufficientSample = ObservabilityAlertEngine.checkAIQualityAlerts(testOrgId, {
    minSampleSize: 20,
    overrideRateThreshold: 0.30,
  });

  const creditIssueAlertNoSample = alertsInsufficientSample.find((a) => a.category === 'CREDIT_ISSUE');
  assert.strictEqual(creditIssueAlertNoSample, undefined, 'Alert MUST NOT fire below minimum sample size');

  const gstAlert = alertsInsufficientSample.find((a) => a.category === 'GST_TAX_ISSUE');
  assert.ok(gstAlert !== undefined, 'Alert MUST fire for GST_TAX_ISSUE (sample size 25 >= 20 and override rate 60% > 30%)');

  console.log('⚡ [PASS] 3. Degradation Alerting & Sample Size Guard: Verified alert fired for GST_TAX_ISSUE (60% > 30%, n=25) and suppressed for CREDIT_ISSUE (75%, n=4 < min 20)');

  // 4. INFRASTRUCTURE METRICS & ALERTING TEST
  // Simulate API metrics with high error rate on /api/billing
  for (let i = 0; i < 8; i++) {
    observabilityStore.recordApiMetric({
      endpoint_group: '/api/billing',
      duration_ms: 120,
      status_code: 200,
      organization_id: testOrgId,
    });
  }
  for (let i = 0; i < 2; i++) {
    observabilityStore.recordApiMetric({
      endpoint_group: '/api/billing',
      duration_ms: 150,
      status_code: 500,
      organization_id: testOrgId,
    });
  }

  const infraAlerts = ObservabilityAlertEngine.checkInfrastructureAlerts(testOrgId, {
    maxErrorRate: 0.05,
  });

  assert.ok(infraAlerts.length > 0, 'Infrastructure alert should fire on 20% error rate spike');
  assert.ok(infraAlerts[0].body.includes('/api/billing') || infraAlerts[0].title.includes('/api/billing'), 'Alert should reference endpoint group');

  // Verify Unit Cost Calculation
  observabilityStore.recordAiReasoningMetric({
    organization_id: testOrgId,
    tokens_used: 1500,
    cost_usd: 0.003,
    duration_ms: 450,
  });

  const unitCost = observabilityStore.getCustomerUnitCost(testOrgId);
  assert.strictEqual(unitCost.total_ai_calls, 1, 'AI call count mismatch');
  assert.ok(unitCost.total_cost_usd > 0, 'Unit cost calculation invalid');

  console.log(`⚡ [PASS] 4. Infrastructure Observability: Verified API error spike alert and tenant unit cost calculation ($${unitCost.total_cost_usd})`);

  // 5. PRE-DEPLOYMENT MODEL VALIDATION TEST
  const validationReport = await ModelValidationRunner.validateCandidateModel({
    candidateModelVersion: 'AIOSpark-O2C-v2.0-Candidate',
  });

  assert.strictEqual(validationReport.gate_passed, true, 'Validation gate should pass for clean candidate');
  assert.strictEqual(validationReport.regression_count, 0, 'Zero regressions expected for baseline candidate');

  console.log('⚡ [PASS] 5. Model Validation Gate: Mandatory pre-deployment candidate validation suite verified clean');

  console.log('\n==========================================');
  console.log('ALL LAYER 29 OBSERVABILITY TESTS PASSED SUCCESSFULLY');
  console.log('==========================================\n');
}
