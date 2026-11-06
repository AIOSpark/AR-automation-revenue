import { runRazorpayBillingTestSuite } from '../src/lib/billing/__tests__/razorpay-billing.test.ts';

runRazorpayBillingTestSuite()
  .then(() => {
    console.log('Razorpay Subscriptions & Webhook test execution complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Razorpay test execution failed:', err);
    process.exit(1);
  });
