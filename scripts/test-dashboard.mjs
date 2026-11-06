import { runDashboardTestSuite } from "../src/lib/dashboard/__tests__/dashboard.test.ts";

runDashboardTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Dashboard test execution error:", err);
    process.exit(1);
  });
