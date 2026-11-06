import { runAlertsTestSuite } from '../src/lib/alerts/__tests__/alerts.test.ts';

runAlertsTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
