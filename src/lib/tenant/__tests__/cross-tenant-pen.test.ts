// AIOSpark Layer 3 Cross-Tenant Penetration & Security Test Suite

import { authStore } from "../../auth/store";
import { tenantStore } from "../store";
import { can, Role } from "../permissions";

export async function runCrossTenantPenetrationSuite() {
  console.log("\n==========================================");
  console.log("RUNNING CROSS-TENANT PENETRATION SUITE");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`🔒 [SEC_PASS] ${testName}`);
      passed++;
    } else {
      console.error(`🚨 [SEC_FAIL] ${testName}`);
      failed++;
    }
  }

  // Reset environment
  authStore.clearAll();
  tenantStore.clearAll();

  // SETUP: Create 2 Isolated Customer Organizations
  const userA = authStore.createUser({
    auth_provider_id: "sb_user_orgA_owner",
    email: "owner@orga.com",
    first_name: "Alice",
    last_name: "OwnerA",
  });
  const orgA = authStore.createOrganizationDraft({
    name: "Organization A Pvt Ltd",
    size: "51-200 employees",
    industry: "SaaS",
    created_by_user_id: userA.id,
  });
  tenantStore.addMember(userA.id, orgA.id, "Owner");

  const userB = authStore.createUser({
    auth_provider_id: "sb_user_orgB_owner",
    email: "owner@orgb.com",
    first_name: "Bob",
    last_name: "OwnerB",
  });
  const orgB = authStore.createOrganizationDraft({
    name: "Organization B Corp",
    size: "201-1000 employees",
    industry: "Logistics",
    created_by_user_id: userB.id,
  });
  tenantStore.addMember(userB.id, orgB.id, "Owner");

  // Create Teammates in Org A with distinct roles
  const viewerUser = authStore.createUser({
    auth_provider_id: "sb_user_orgA_viewer",
    email: "viewer@orga.com",
    first_name: "Vicky",
    last_name: "Viewer",
  });
  tenantStore.addMember(viewerUser.id, orgA.id, "Viewer");

  const execUser = authStore.createUser({
    auth_provider_id: "sb_user_orgA_exec",
    email: "exec@orga.com",
    first_name: "Edward",
    last_name: "Executive",
  });
  tenantStore.addMember(execUser.id, orgA.id, "Finance Executive");

  // Seed Data: Insert confidential invoice into Org B
  tenantStore.setSessionTenantContext(orgB.id);
  const secretInvoiceOrgB = tenantStore.insertTenantRecord("invoices", {
    organization_id: orgB.id,
    invoice_number: "INV-SECRET-ORGB-99",
    amount: 8500000,
    status: "Payment Blocked",
  });

  // Seed Data: Insert normal invoice into Org A
  tenantStore.setSessionTenantContext(orgA.id);
  const invoiceOrgA = tenantStore.insertTenantRecord("invoices", {
    organization_id: orgA.id,
    invoice_number: "INV-ORGA-101",
    amount: 1200000,
    status: "Pending Clearance",
  });

  // TEST 1: User in Org A attempts to fetch Org B record by ID -> MUST FAIL
  tenantStore.setSessionTenantContext(orgA.id);
  const leakRecordFetch = tenantStore.getTenantRecordById("invoices", secretInvoiceOrgB.id);
  assert(
    leakRecordFetch === null,
    "1. Cross-Tenant Direct Record Access — User in Org A fetching Org B record by ID is BLOCKED"
  );

  // TEST 2: User in Org A attempts to list records -> MUST RETURN ZERO Org B records
  tenantStore.setSessionTenantContext(orgA.id);
  const orgAInvoices = tenantStore.queryTenantTable("invoices");
  const leakedCount = orgAInvoices.filter((inv) => inv.organization_id === orgB.id).length;
  assert(
    orgAInvoices.length === 1 && leakedCount === 0,
    "2. Cross-Tenant List Pollution Protection — User in Org A list query returns ZERO Org B records"
  );

  // TEST 3: Viewer role attempts write/edit/delete action -> MUST FAIL
  const viewerCanCreate = can("Viewer", "create", "invoices");
  const viewerCanEdit = can("Viewer", "edit", "invoices");
  const viewerCanDelete = can("Viewer", "delete", "invoices");
  assert(
    !viewerCanCreate && !viewerCanEdit && !viewerCanDelete,
    "3. Role Hierarchy Restriction — Viewer role write/edit/delete actions are DENIED"
  );

  // TEST 4: Finance Executive attempts to approve action -> MUST FAIL
  const execCanApprove = can("Finance Executive", "approve", "approvals");
  const managerCanApprove = can("Finance Manager", "approve", "approvals");
  assert(
    !execCanApprove && managerCanApprove,
    "4. Separation of Duties — Finance Executive approval attempt DENIED (Manager approval ALLOWED)"
  );

  // TEST 5: Querying database directly bypassing session context (app.current_org_id = null) -> MUST BE BLOCKED BY RLS (0 ROWS)
  tenantStore.setSessionTenantContext(null); // Simulates missing middleware / raw DB query
  const rawDbBypassResult = tenantStore.queryTenantTable("invoices");
  assert(
    rawDbBypassResult.length === 0,
    "5. Hard Database RLS Boundary — Uncontextualized raw DB query returns 0 rows (RLS Policy Active)"
  );

  // TEST 6: Extended Post-Layer 3 Table RLS Audits (bank_transactions, alerts, report_schedules)
  const { udmStore } = await import("../../udm/store");
  const { alertsEngineStore } = await import("../../alerts/store");
  const { reportSchedulerStore } = await import("../../reports/scheduler");

  udmStore.setTenantContext(orgB.id);
  udmStore.insertBankTransaction({
    organization_id: orgB.id,
    source_system: "manual_upload",
    raw_reference: "NEFT-SECRET-ORGB",
    amount_minor_units: 5000000,
    currency: "INR",
    date: "2026-09-01",
    narration_text: "Confidential Org B Deposit",
    status: "unmatched",
  });

  // Switch context to Org A -> querying Org B bank transactions MUST return 0
  udmStore.setTenantContext(orgA.id);
  const orgABankTxs = udmStore.getBankTransactions();
  assert(
    orgABankTxs.filter((bt) => bt.organization_id === orgB.id).length === 0,
    "6a. Post-Layer 3 Table RLS — bank_transactions strictly isolated by tenant context"
  );

  reportSchedulerStore.createSchedule({
    organization_id: orgB.id,
    report_id: "aging_report",
    format: "pdf",
    recipients: ["cfo@orgb.com"],
    cadence: "weekly",
    created_by_user_id: userB.id,
  });

  const orgASchedules = reportSchedulerStore.getSchedules(orgA.id);
  assert(
    orgASchedules.filter((s) => s.organization_id === orgB.id).length === 0,
    "6b. Post-Layer 3 Table RLS — report_schedules strictly isolated by tenant context"
  );

  // TEST 7: Multi-Tenant Membership Switch Verification
  tenantStore.addMember(userA.id, orgB.id, "Viewer"); // User A invited to Org B as Viewer
  const userAOrgs = tenantStore.getUserOrganizations(userA.id);
  assert(
    userAOrgs.length === 2,
    "7. Multi-Tenant Membership — Single user belongs to multiple organizations with distinct roles"
  );

  console.log("\n==========================================");
  console.log(`SECURITY SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================\n");

  return { passed, failed };
}
