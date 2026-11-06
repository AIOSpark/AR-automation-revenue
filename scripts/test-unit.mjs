import { runUnitTestSuite } from '../src/lib/testing/__tests__/unit.test.ts';

runUnitTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(`❌ Unit Test Suite finished with ${failed} failures.`);
      process.exit(1);
    } else {
      console.log('✅ Unit Test Suite completed successfully!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Unit Test Suite error:', err);
    process.exit(1);
  });
