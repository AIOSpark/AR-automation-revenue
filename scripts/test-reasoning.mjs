import { runReasoningEngineTestSuite } from "../src/lib/intelligence/__tests__/reasoning-engine.test.ts";

runReasoningEngineTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Reasoning engine test execution error:", err);
    process.exit(1);
  });
