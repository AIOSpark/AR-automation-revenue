import { runUdmTestSuite } from "../src/lib/udm/__tests__/udm.test.ts";

runUdmTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("UDM test execution error:", err);
    process.exit(1);
  });
