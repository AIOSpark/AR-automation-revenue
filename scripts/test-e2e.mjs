import { runE2EJourneysTestSuite } from '../src/lib/testing/__tests__/e2e-journeys.test.ts';

runE2EJourneysTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(`❌ E2E Journeys Test Suite finished with ${failed} failures.`);
      process.exit(1);
    } else {
      console.log('✅ E2E Journeys Test Suite completed successfully!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 E2E Journeys Test Suite error:', err);
    process.exit(1);
  });
