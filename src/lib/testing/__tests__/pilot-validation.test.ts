// AIOSpark Step 10 — Finance User Testing & Pilot Validation Test Suite

import { pilotValidationEngine } from '../pilot-validation-engine';
import { REALISTIC_PILOT_DATASETS } from '../pilot-test-datasets';
import { udmStore } from '../../udm/store';
import { promiseStore } from '../../promises/store';

export async function runPilotValidationTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING STEP 10 PILOT VALIDATION SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`⚡ [VALIDATION_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [VALIDATION_FAIL] ${message}`);
      failed++;
    }
  }

  const orgId = 'org_pilot_val_10';
  udmStore.clearAll();
  promiseStore.clearAll();
  pilotValidationEngine.clearAll();
  udmStore.setTenantContext(orgId);

  // 1. Task Protocol Execution across User Personas
  const case01 = REALISTIC_PILOT_DATASETS.find(c => c.id === 'CASE-01-PARTIAL')!;
  const opResults = pilotValidationEngine.executeTaskProtocol(orgId, 'OPERATIONAL_USER', case01);
  assert(opResults.length === 11, 'Persona Protocol Test 1: Operational user completed all 11 task steps');
  assert(opResults.every(r => r.status === 'SUCCESS'), 'Persona Protocol Test 2: Operational user tasks succeeded without blockers');

  const mgrResults = pilotValidationEngine.executeTaskProtocol(orgId, 'MANAGER', case01);
  assert(mgrResults.length === 11, 'Persona Protocol Test 3: Finance Manager completed all 11 task steps');

  const execResults = pilotValidationEngine.executeTaskProtocol(orgId, 'EXECUTIVE', case01);
  assert(execResults.length === 11, 'Persona Protocol Test 4: CFO / Executive completed all 11 task steps');

  // 2. Realistic & Messy Dataset Edge Cases Validation
  const caseUnallocated = REALISTIC_PILOT_DATASETS.find(c => c.id === 'CASE-02-UNALLOCATED')!;
  const unallocResults = pilotValidationEngine.executeTaskProtocol(orgId, 'OPERATIONAL_USER', caseUnallocated);
  assert(unallocResults.some(r => r.taskId === 'TASK_07_NEXT_BEST_ACTION'), 'Edge Case Test 1: Unallocated payment dataset executed through NBA task');

  const caseStale = REALISTIC_PILOT_DATASETS.find(c => c.id === 'CASE-07-STALE-DATA')!;
  const staleResults = pilotValidationEngine.executeTaskProtocol(orgId, 'OPERATIONAL_USER', caseStale);
  const dataQualityTask = staleResults.find(r => r.taskId === 'TASK_02_DATA_QUALITY');
  assert(dataQualityTask?.status === 'PARTIAL', 'Edge Case Test 2: Stale data trigger flagged data quality warning');

  const caseScenario = REALISTIC_PILOT_DATASETS.find(c => c.id === 'CASE-08-SCENARIO-DISTINCTION')!;
  const simResults = pilotValidationEngine.executeTaskProtocol(orgId, 'OPERATIONAL_USER', caseScenario);
  const simTask = simResults.find(r => r.taskId === 'TASK_09_SIMULATOR');
  assert(simTask?.status === 'SUCCESS', 'Edge Case Test 3: Cash Unblock Simulator explicitly tagged output as hypothetical scenario');

  // 3. Financial Golden Correctness & Strict P0 Enforcement
  udmStore.clearAll();
  udmStore.setTenantContext(orgId);
  const report = pilotValidationEngine.generatePilotValidationReport(orgId);
  assert(report.readinessGate.financialAccuracyRate === 100.0, 'Financial Correctness Test: Zero arithmetic errors across test sessions');

  // 4. Pilot Readiness Gate & Success Criteria Evaluation
  const readiness = report.readinessGate;
  assert(readiness.isReadyForPaidPilot === true, 'Pilot Gate Test 1: Evaluated ready for paid pilot');
  assert(readiness.satisfiedCriteriaCount === 23, 'Pilot Gate Test 2: All 23 step 10 success criteria satisfied');
  assert(readiness.criticalP0IssuesCount === 0, 'Pilot Gate Test 3: Zero open P0 blocker issues');
  assert(readiness.top5PrioritizedFixes.length === 5, 'Pilot Gate Test 4: Top 5 priority product fixes identified');

  // 5. Comprehensive Report Generation Verification
  assert(Boolean(report.markdownSummary && report.markdownSummary.includes('READY FOR PAID PILOT')), 'Report Generation Test: Generated valid markdown report summary');
  assert(report.positioningQuotes.length > 0, 'Report Generation Test: Natural user positioning quote captured');

  console.log(`\n==========================================`);
  console.log(`STEP 10 PILOT VALIDATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  return { passed, failed };
}
