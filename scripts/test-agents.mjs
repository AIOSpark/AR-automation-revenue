import { runAgentTestSuite } from '../src/lib/agents/__tests__/agents.test';

runAgentTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
