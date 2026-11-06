import { runOnboardingTestSuite } from "../src/lib/onboarding/__tests__/onboarding.test.ts";

runOnboardingTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error("ONBOARDING TEST ERROR: Automated test suite failed!");
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Onboarding test execution error:", err);
    process.exit(1);
  });
