// AIOSpark Iteration 21.1 — Pilot-Mode Security Test (runner)
// Runs the pilot-security test in its own file-backed process so pilot-mode
// restart persistence can be verified. Exits non-zero on any failure.
//
// Run: AIOSPARK_DB_PATH=<temp sqlite file> AIOSPARK_TEST_MODE=false node --import tsx scripts/test-pilot-security.mjs

import { runPilotSecurityTest } from '../src/lib/testing/__tests__/pilot-security.test.ts';

runPilotSecurityTest()
  .then((results) => {
    if (results.failed > 0) {
      console.error(`❌ Pilot-Mode Security Test finished with ${results.failed} failure(s).`);
      process.exit(1);
    } else {
      console.log(`✅ Pilot-Mode Security Test completed successfully! (${results.passed} passed)`);
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Pilot-Mode Security Test execution error:', err);
    process.exit(1);
  });
