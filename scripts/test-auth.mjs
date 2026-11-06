import { runAuthTestSuite } from "../src/lib/auth/__tests__/auth.test.ts";

runAuthTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
