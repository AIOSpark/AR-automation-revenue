import { runReceivablesTestSuite } from "../src/lib/receivables/__tests__/receivables.test.ts";

runReceivablesTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Receivables test execution error:", err);
    process.exit(1);
  });
