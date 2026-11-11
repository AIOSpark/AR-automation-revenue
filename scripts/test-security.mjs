import { runSecurityCITestSuite } from '../src/lib/testing/__tests__/security-ci.test.ts';

// Set test environment variables BEFORE any store imports
process.env.AIOSPARK_TEST_MODE = 'true';
process.env.AIOSPARK_SESSION_SECRET = 'test-security-session-secret-0123456789abcdef';

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
