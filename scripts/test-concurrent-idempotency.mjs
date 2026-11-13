// AIOSpark Iteration 22.2 — Concurrent Idempotency Test (runner)
// Runs the concurrent idempotency test in its own file-backed process.
//
// Run: AIOSPARK_DB_PATH=<temp sqlite file> AIOSPARK_TEST_MODE=false node --import tsx scripts/test-concurrent-idempotency.mjs

import { runConcurrentIdempotencyTest } from '../src/lib/testing/__tests__/concurrent-idempotency.test';

runConcurrentIdempotencyTest()
  .then((results) => {
    if (results.failed > 0) {
      console.error(`❌ Concurrent Idempotency Test finished with ${results.failed} failure(s).`);
      process.exit(1);
    } else {
      console.log(`✅ Concurrent Idempotency Test completed successfully! (${results.passed} passed)`);
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Concurrent Idempotency Test execution error:', err);
    process.exit(1);
  });
