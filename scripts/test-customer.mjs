import { runCustomer360TestSuite } from "../src/lib/customer/__tests__/customer.test.ts";

runCustomer360TestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Customer 360 test execution error:", err);
    process.exit(1);
  });
