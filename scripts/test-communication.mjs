import { runCommunicationTestSuite } from '../src/lib/communication/__tests__/communication.test';

runCommunicationTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
