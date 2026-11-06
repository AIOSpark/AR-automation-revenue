import { runMasterTestSuite } from '../src/lib/master.test.js';

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
