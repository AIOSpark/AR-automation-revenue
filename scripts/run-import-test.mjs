import { runImportPipelineTestSuite } from '../src/lib/import/__tests__/import.test';
const result = await runImportPipelineTestSuite();
console.log(`Result: ${result.passed} passed, ${result.failed} failed`);
process.exit(result.failed > 0 ? 1 : 0);
