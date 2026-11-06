import { runSecurityCITestSuite } from '../src/lib/testing/__tests__/security-ci.test.ts';

runSecurityCITestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(`❌ Security Test Suite finished with ${failed} failures.`);
      process.exit(1);
    } else {
      console.log('✅ Security Test Suite completed successfully!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Security Test Suite error:', err);
    process.exit(1);
  });
