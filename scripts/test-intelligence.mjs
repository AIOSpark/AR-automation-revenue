import { runIntelligenceTestSuite } from "../src/lib/intelligence/__tests__/intelligence.test.ts";

runIntelligenceTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Intelligence test execution error:", err);
    process.exit(1);
  });
