import { runOrchestrationTestSuite } from '../src/lib/agents/__tests__/orchestration.test';

runOrchestrationTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
