import { runPhase3TestSuite } from "../src/lib/import/__tests__/phase3.test";

runPhase3TestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
