import { runCFOTestSuite } from '../src/lib/cfo/__tests__/cfo.test.ts';

runCFOTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
