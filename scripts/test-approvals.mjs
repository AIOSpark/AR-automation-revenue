import { runApprovalTestSuite } from '../src/lib/approvals/__tests__/approvals.test';

runApprovalTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
