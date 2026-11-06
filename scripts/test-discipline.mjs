import { runDisciplineTestSuite } from '../src/lib/discipline/__tests__/contracts.test.js';

runDisciplineTestSuite()
  .then(() => {
    console.log('Layer 35 Stable Interface Discipline suite execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Layer 35 Stable Interface Discipline suite execution failed:', err);
    process.exit(1);
  });
