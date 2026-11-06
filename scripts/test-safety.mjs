import { runSafetyTestSuite } from '../src/lib/agents/__tests__/safety-adversarial.test.js';

runSafetyTestSuite()
  .then(() => {
    console.log('Layer 30 AI Safety suite execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Layer 30 AI Safety suite execution failed:', err);
    process.exit(1);
  });
