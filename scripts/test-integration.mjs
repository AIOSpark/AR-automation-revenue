import { runIntegrationCITestSuite } from '../src/lib/testing/__tests__/integration-ci.test.ts';

runIntegrationCITestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(`❌ Integration Test Suite finished with ${failed} failures.`);
      process.exit(1);
    } else {
      console.log('✅ Integration Test Suite completed successfully!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Integration Test Suite error:', err);
    process.exit(1);
  });
