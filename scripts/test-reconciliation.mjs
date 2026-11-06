import { runReconciliationTestSuite } from '../src/lib/reconciliation/__tests__/reconciliation.test.ts';

runReconciliationTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
