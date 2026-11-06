import { runTaxonomyTestSuite } from "../src/lib/taxonomy/__tests__/taxonomy.test.ts";

runTaxonomyTestSuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Taxonomy test execution error:", err);
    process.exit(1);
  });
