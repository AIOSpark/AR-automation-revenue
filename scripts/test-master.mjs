import { runMasterTestSuite } from '../src/lib/master.test.js';

// Set test environment variables BEFORE any store imports
process.env.AIOSPARK_DB_PATH = '/tmp/aiospark-master-test.sqlite';
process.env.AIOSPARK_TEST_MODE = 'true';
process.env.AIOSPARK_SESSION_SECRET = 'test-master-session-secret-0123456789abcdef';

runMasterTestSuite()
  .then((results) => {
    if (results.totalFailed > 0) {
      console.error(`❌ Master Test Suite finished with ${results.totalFailed} failures.`);
      process.exit(1);
    } else {
      console.log(`✅ Master Test Suite completed successfully! (${results.totalPassed} tests passed)`);
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Master Test Suite execution error:', err);
    process.exit(1);
  });
