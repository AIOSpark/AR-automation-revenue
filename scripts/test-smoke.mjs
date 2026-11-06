import { runSmokeTestSuite } from '../src/lib/testing/__tests__/smoke.test.ts';

runSmokeTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(`❌ Smoke Test Suite finished with ${failed} failures.`);
      process.exit(1);
    } else {
      console.log('✅ Production Smoke Test Suite completed successfully!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Smoke Test Suite error:', err);
    process.exit(1);
  });
