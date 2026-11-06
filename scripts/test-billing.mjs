import { runBillingTestSuite } from '../src/lib/billing/__tests__/billing.test.js';

runBillingTestSuite()
  .then(() => {
    console.log('Layer 27 billing suite execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Layer 27 billing suite execution failed:', err);
    process.exit(1);
  });
