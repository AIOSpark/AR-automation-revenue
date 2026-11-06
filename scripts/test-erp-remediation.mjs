import { runErpRemediationTestSuite } from '../src/lib/adapters/__tests__/erp-remediation.test';

runErpRemediationTestSuite()
  .then(() => {
    console.log('ERP Remediation test execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('ERP Remediation test execution failed:', err);
    process.exit(1);
  });
