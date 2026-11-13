// AIOSpark Iteration 22.1 — Durability Restart & Recovery Test (runner)
// Runs the durability restart test in its own file-backed process so a genuine
// process restart can be verified. Exits non-zero on any failure.
//
// Run: AIOSPARK_DB_PATH=<temp sqlite file> AIOSPARK_TEST_MODE=false node --import tsx scripts/test-durability-restart.mjs

import { runDurabilityRestartTest } from '../src/lib/testing/__tests__/durability-restart.test';

runDurabilityRestartTest()
  .then((results) => {
    if (results.failed > 0) {
      console.error(`❌ Durability Restart Test finished with ${results.failed} failure(s).`);
      process.exit(1);
    } else {
      console.log(`✅ Durability Restart Test completed successfully! (${results.passed} passed)`);
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Durability Restart Test execution error:', err);
    process.exit(1);
  });
