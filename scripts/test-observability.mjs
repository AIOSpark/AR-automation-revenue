import { runObservabilityTestSuite } from '../src/lib/observability/__tests__/observability.test.js';

runObservabilityTestSuite()
  .then(() => {
    console.log('Layer 29 observability suite execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Layer 29 observability suite execution failed:', err);
    process.exit(1);
  });
