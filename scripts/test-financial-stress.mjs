import { runFinancialStressTestSuite } from '../src/lib/testing/__tests__/financial-stress.test.ts';
import { setRequestTenant } from '../src/lib/tenant/request-context';

setRequestTenant('org_stress_test');

runFinancialStressTestSuite()
  .then(() => {
    console.log('✅ Financial Stress Test Suite completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('🚨 Financial Stress Test Suite error:', err);
    process.exit(1);
  });