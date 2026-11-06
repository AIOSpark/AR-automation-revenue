import { runCrossTenantPenetrationSuite } from "../src/lib/tenant/__tests__/cross-tenant-pen.test.ts";

runCrossTenantPenetrationSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error("CRITICAL SECURITY ERROR: Cross-tenant penetration test failed!");
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Penetration test execution error:", err);
    process.exit(1);
  });
