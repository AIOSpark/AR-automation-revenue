import { runPromiseTestSuite } from '../src/lib/promises/__tests__/promises.test';

runPromiseTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
