import { runAuditTestSuite } from '../src/lib/audit/__tests__/audit.test.js';

runAuditTestSuite()
  .then(() => {
    console.log('Layer 26 audit suite execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Layer 26 audit suite execution failed:', err);
    process.exit(1);
  });
