// HIGH-011 financial RBAC verification runner.
// Set test configuration before importing any store or route module.
process.env.AIOSPARK_TEST_MODE = 'true';
process.env.AIOSPARK_SESSION_SECRET = 'test-financial-rbac-secret-0123456789abcdef';

const { runFinancialRbacSuite } = await import(
  '../src/lib/auth/__tests__/financial-rbac.test.ts'
);

runFinancialRbacSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(`❌ Financial RBAC suite finished with ${failed} failures.`);
      process.exit(1);
    }
    console.log('✅ Financial RBAC suite completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('🚨 Financial RBAC suite execution error:', error);
    process.exit(1);
  });
