// AIOSpark Iteration 21.1 — SQLite Durability & Restart Test (runner)
// Runs the durability test in its own file-backed process so a genuine
// process restart can be verified. Exits non-zero on any failure.
//
// Run: AIOSPARK_DB_PATH=<temp sqlite file> AIOSPARK_TEST_MODE=false node --import tsx scripts/test-durability.mjs

import { runSqliteDurabilityTest } from '../src/lib/testing/__tests__/sqlite-durability.test.ts';

runSqliteDurabilityTest()
  .then((results) => {
    if (results.failed > 0) {
      console.error(`❌ SQLite Durability Test finished with ${results.failed} failure(s).`);
      process.exit(1);
    } else {
      console.log(`✅ SQLite Durability Test completed successfully! (${results.passed} passed)`);
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 SQLite Durability Test execution error:', err);
    process.exit(1);
  });
