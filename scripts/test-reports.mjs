import { runReportingTestSuite } from '../src/lib/reports/__tests__/reports.test.ts';

runReportingTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
