// AIOSpark Layer 4 Onboarding Test Suite

import { authStore } from "../../auth/store";
import { tenantStore } from "../../tenant/store";
import { onboardingStore, TARGET_FIELDS } from "../store";

export async function runOnboardingTestSuite() {
  console.log("\n==========================================");
  console.log("RUNNING AIOSPARK LAYER 4 ONBOARDING TEST SUITE");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`🚀 [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // Setup: Create test user & organization
  authStore.clearAll();
  tenantStore.clearAll();
  onboardingStore.clearAll();

  const user = authStore.createUser({
    auth_provider_id: "sb_user_onboarding_test",
    email: "cfo@apexsolutions.com",
    first_name: "Vikram",
    last_name: "Sharma",
  });

  const org = authStore.createOrganizationDraft({
    name: "Apex Enterprise Solutions",
    size: "51-200 employees",
    industry: "IT Services & SaaS",
    created_by_user_id: user.id,
  });

  // TEST 1: Save Financial Setup Parameters
  const updatedOrg = onboardingStore.saveCompanySetup({
    organization_id: org.id,
    industry: "IT Services & SaaS",
    annual_revenue_range: "10-50Cr",
    currency: "INR",
    fy_start_month: "April",
    default_payment_terms: "Net 30",
    timezone: "Asia/Kolkata",
    country: "India",
  });

  assert(updatedOrg !== null, "1a. Company Setup - Financial Setup Parameters Saved");
  assert((updatedOrg as any)?.currency === "INR", "1b. Company Setup - Currency Explicitly Saved");
  assert((updatedOrg as any)?.fy_start_month === "April", "1c. Company Setup - FY Start Month Stored Distinctly");

  // TEST 2: Column Auto-Mapping Engine
  const sampleHeaders = ["Client Name", "Invoice No", "Total Amount", "Bill Date", "Payment Status"];
  const suggestedMapping = onboardingStore.autoSuggestMapping(sampleHeaders);

  assert(suggestedMapping.customer_name === "Client Name", "2a. Auto-Suggest Engine - Mapped Customer Name");
  assert(suggestedMapping.invoice_number === "Invoice No", "2b. Auto-Suggest Engine - Mapped Invoice Number");
  assert(suggestedMapping.amount === "Total Amount", "2c. Auto-Suggest Engine - Mapped Amount");

  // TEST 3: Saved Column Mapping per Organization
  const customMapping = {
    customer_name: "Client Name",
    invoice_number: "Invoice No",
    amount: "Total Amount",
    issue_date: "Bill Date",
    status: "Payment Status",
  };

  onboardingStore.saveOrgColumnMapping(org.id, customMapping);
  const retrievedMapping = onboardingStore.getOrgColumnMapping(org.id);

  assert(retrievedMapping?.customer_name === "Client Name", "3a. Saved Org Mapping - Saved & Retrieved for Org ID");

  // TEST 4: Fault-Tolerant File Import Execution
  const sampleRows = [
    { "Client Name": "Apex Tech Logistics", "Invoice No": "INV-1001", "Total Amount": "₹15,00,000", "Bill Date": "2026-04-01", "Payment Status": "Payment Blocked" },
    { "Client Name": "Global Nexus Retail", "Invoice No": "INV-1002", "Total Amount": "₹22,50,000", "Bill Date": "2026-04-05", "Payment Status": "Action Required" },
    { "Client Name": "", "Invoice No": "INV-BAD-1", "Total Amount": "₹5,00,000", "Bill Date": "2026-04-10" }, // INVALID: Missing Customer
    { "Client Name": "Broken Row Corp", "Invoice No": "INV-BAD-2", "Total Amount": "INVALID_AMOUNT", "Bill Date": "2026-04-12" }, // INVALID: Non-numeric amount
    { "Client Name": "Horizon Health Systems", "Invoice No": "INV-1003", "Total Amount": "₹11,50,000", "Bill Date": "2026-04-15", "Payment Status": "Escalated" },
  ];

  const batchResult = onboardingStore.processFileImport(org.id, sampleRows, customMapping);

  assert(batchResult.totalRows === 5, "4a. Fault-Tolerant Pipeline - Processed 5 Total Rows");
  assert(batchResult.successCount === 3, "4b. Fault-Tolerant Pipeline - 3 Valid Invoices Imported Successfully");
  assert(batchResult.skippedCount === 2, "4c. Fault-Tolerant Pipeline - 2 Invalid Rows Excluded Without Crashing Import");
  assert(batchResult.errors.length === 2, "4d. Fault-Tolerant Pipeline - Per-Row Error List Logged");

  // TEST 5: Verify Tenant Ledgers Created
  tenantStore.setSessionTenantContext(org.id);
  const importedInvoices = tenantStore.queryTenantTable("invoices");

  assert(importedInvoices.length === 3, "5a. Tenant Ledger Sync - Imported Rows Written to Tenant Ledgers with organization_id");

  console.log("\n==========================================");
  console.log(`ONBOARDING SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================\n");

  return { passed, failed };
}
