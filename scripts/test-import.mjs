import { runImportPipelineTestSuite } from "../src/lib/import/__tests__/import.test.ts";

runImportPipelineTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Import pipeline test execution error:", err);
    process.exit(1);
  });
