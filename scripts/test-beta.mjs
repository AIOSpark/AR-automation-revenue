import { runBetaTestSuite } from '../src/lib/beta/__tests__/beta.test.js';

runBetaTestSuite()
  .then(() => {
    console.log('Layer 31 Private Beta suite execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Layer 31 Private Beta suite execution failed:', err);
    process.exit(1);
  });
