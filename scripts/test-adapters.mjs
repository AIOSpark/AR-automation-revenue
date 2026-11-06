import { runAdapterContractTestSuite } from "../src/lib/adapters/__tests__/adapter-contract.test.ts";

runAdapterContractTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Adapter test execution error:", err);
    process.exit(1);
  });
