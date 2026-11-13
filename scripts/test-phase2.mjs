import { runPhase2TestSuite } from "../src/lib/auth/__tests__/phase2-onboarding.test";

runPhase2TestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
