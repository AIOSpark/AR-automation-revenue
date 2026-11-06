// AIOSpark Layer 11 Invoice Intelligence Test Suite

import { getMockAIAnalysis } from '../ai-analysis-contract';

export async function runIntelligenceTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 11 INTELLIGENCE TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`🤖 [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Contract Integrity Check - High Conf Scenario
  const highConf = getMockAIAnalysis('po_mismatch');
  assert(
    highConf !== null &&
      highConf.confidence === 0.95 &&
      highConf.evidence.length === 2 &&
      highConf.evidence[0].delta === '50 units overbilled',
    '1a. Contract Integrity - High confidence mock scenario produces valid structured evidence'
  );

  // 2. Low Confidence Scenario Band (<0.6)
  const lowConf = getMockAIAnalysis('low_confidence');
  assert(
    lowConf !== null && lowConf.confidence < 0.6,
    '2a. Confidence Band - Low confidence scenario evaluates to <0.6 threshold'
  );

  // 3. Structural Enforcement Rule - Empty Evidence Array Fault
  const emptyEvidenceFault = getMockAIAnalysis('empty_evidence_fault');
  assert(
    emptyEvidenceFault !== null && emptyEvidenceFault.evidence.length === 0,
    '3a. Structural Enforcement - Empty evidence fault detected correctly'
  );

  // 4. Null Analysis Scenario (Calm "Pending" Fallback)
  const nullAnalysis = getMockAIAnalysis('no_analysis');
  assert(nullAnalysis === null, '4a. Fallback State - No analysis scenario returns null for calm pending UI');

  console.log('\n==========================================');
  console.log(`INTELLIGENCE SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
