import { runFinancialTestSuite } from '../src/lib/testing/__tests__/financial.test.ts';

runFinancialTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(`❌ Financial Test Suite finished with ${failed} failures.`);
      process.exit(1);
    } else {
      console.log('✅ Financial Test Suite completed successfully!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('🚨 Financial Test Suite error:', err);
    process.exit(1);
  });
