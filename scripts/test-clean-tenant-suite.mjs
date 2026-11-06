import { runCleanOrganizationVerificationSuite } from '../src/lib/tenant/__tests__/clean-tenant-suite.test.ts';

runCleanOrganizationVerificationSuite()
  .then(() => {
    console.log('Clean organization zero-data test execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Clean organization zero-data test execution failed:', err);
    process.exit(1);
  });
