import { runPreviewConfirmSecuritySuite } from "../src/lib/auth/__tests__/preview-confirm-security.test";

runPreviewConfirmSecuritySuite()
  .then(({ failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
