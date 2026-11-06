import { runExceptionEngineTestSuite } from "../src/lib/exceptions/__tests__/exceptions.test.ts";

runExceptionEngineTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Exception engine test execution error:", err);
    process.exit(1);
  });
