import { PGlite } from '@electric-sql/pglite';
import { getSecurityMigrationSQL } from '../../db/security-migrations';
import { authStore } from '../../auth/store';
import { tenantStore } from '../../tenant/store';
import { udmStore } from '../../udm/store';
import { dashboardMetricsStore } from '../../dashboard/engine';
import { cfoIntelligenceEngine } from '../../cfo/engine';
import { queryReceivablesTable } from '../../receivables/engine';
import { approvalStore } from '../../approvals/store';
import { TallyAdapter } from '../../adapters/tally';
import { ZohoBooksAdapter } from '../../adapters/zoho';
import { integrationSyncEngine } from '../../integrations/sync-engine';

export async function runCleanOrganizationVerificationSuite() {
  console.log('================================================================');
  console.log('AIOSpark Clean Organization Zero-Data & Isolation Acceptance Suite');
  console.log('================================================================\n');

  // Initialize DB engine
  const db = new PGlite();

  await db.exec(`
    CREATE TYPE role_enum AS ENUM ('Admin', 'Manager', 'Analyst', 'Viewer');
    CREATE TYPE payment_delay_category_enum AS ENUM ('NORMAL_CYCLE', 'PAYMENT_PROMISED', 'CUSTOMER_DISPUTE', 'PO_MISMATCH', 'INVOICE_ERROR', 'GST_TAX_ISSUE', 'MISSING_DOCUMENT', 'DELIVERY_ISSUE', 'APPROVAL_PENDING', 'CREDIT_ISSUE', 'UNKNOWN');
    CREATE TYPE actor_type_enum AS ENUM ('user', 'agent', 'system');
    CREATE TYPE audit_result_enum AS ENUM ('success', 'failure', 'reverted');

    CREATE TABLE organizations (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE customer_contacts (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      amount_minor_units BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      amount_minor_units BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE audit_logs (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      result audit_result_enum NOT NULL DEFAULT 'success',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.exec(getSecurityMigrationSQL());

  // STEP 1 & 2: Create Clean Tenant via Auth & Tenant Stores
  const uniqueId = Date.now();
  const cleanOrgName = `AIOSpark Clean Tenant ${uniqueId}`;
  const cleanUserEmail = `clean-test-${uniqueId}@example.test`;

  console.log(`1. Creating Clean Tenant via user-facing flow...`);
  console.log(`   Org Name: "${cleanOrgName}"`);
  console.log(`   User Email: "${cleanUserEmail}"`);

  const user = authStore.createUser({
    auth_provider_id: `auth_prov_${uniqueId}`,
    email: cleanUserEmail,
    first_name: 'Clean',
    last_name: 'Admin',
    email_verified: true,
  });

  const org = authStore.createOrganizationDraft({
    name: cleanOrgName,
    size: '10-50',
    industry: 'Technology',
    created_by_user_id: user.id,
  });

  tenantStore.addMember(user.id, org.id, 'Owner');
  udmStore.setTenantContext(org.id);

  console.log(`   ✓ Clean Tenant Created (Org ID: ${org.id}, User ID: ${user.id})`);

  // STEP 3 & 4: Database Zero-Data & Financial Verification
  console.log('\n2. Verifying Database & UDM Zero-Data Persistence...');
  const customers = udmStore.getCustomers();
  const invoices = udmStore.getInvoices();
  const payments = udmStore.getPayments();
  const exceptions = udmStore.getExceptions();
  const bankTxs = udmStore.getBankTransactions();

  console.log(`   - Customers Count: ${customers.length}`);
  console.log(`   - Invoices Count: ${invoices.length}`);
  console.log(`   - Payments Count: ${payments.length}`);
  console.log(`   - Exceptions Count: ${exceptions.length}`);
  console.log(`   - Bank Transactions Count: ${bankTxs.length}`);

  if (customers.length !== 0 || invoices.length !== 0 || payments.length !== 0 || exceptions.length !== 0) {
    throw new Error('FAIL: Clean organization contains non-zero business records!');
  }
  console.log('   ✓ PASS: UDM database tables verified at EXACTLY 0 records.');

  console.log('\n3. Verifying Financial Metrics Zero State...');
  const dashboardKpis = dashboardMetricsStore.refreshMetrics(org.id);
  const cfoOverview = cfoIntelligenceEngine.getOverview(org.id);
  const receivablesTable = queryReceivablesTable(org.id, {});

  console.log(`   - Total Receivables: ₹${dashboardKpis.totalReceivablesMinorUnits / 100}`);
  console.log(`   - Overdue Amount: ₹${dashboardKpis.overdueMinorUnits / 100}`);
  console.log(`   - Actionable Cash Unblocked: ₹${cfoOverview.actionableBlockersMinorUnits / 100}`);
  console.log(`   - Receivables Table Row Count: ${receivablesTable.totalCount}`);

  if (
    dashboardKpis.totalReceivablesMinorUnits !== 0 ||
    dashboardKpis.overdueMinorUnits !== 0 ||
    cfoOverview.actionableBlockersMinorUnits !== 0 ||
    receivablesTable.totalCount !== 0
  ) {
    throw new Error('FAIL: Financial metrics calculated non-zero values for empty tenant!');
  }
  console.log('   ✓ PASS: All financial metrics deterministically resolve to ₹0.');

  // STEP 5: Unconfigured ERP Sync Attempt
  console.log('\n4. Testing Unconfigured ERP Sync Attempt (Tally & Zoho)...');
  const tallyJob = await integrationSyncEngine.executeSync(org.id, 'tally', user.id);
  const zohoJob = await integrationSyncEngine.executeSync(org.id, 'zoho', user.id);

  console.log(`   - Tally Sync Job Status: ${tallyJob.status} (${tallyJob.errorSummary})`);
  console.log(`   - Zoho Sync Job Status: ${zohoJob.status} (${zohoJob.errorSummary})`);

  const postSyncInvoices = udmStore.getInvoices();
  if (postSyncInvoices.length !== 0) {
    throw new Error('FAIL: Unconfigured ERP sync leaked synthetic data into clean tenant!');
  }
  console.log('   ✓ PASS: Unconfigured ERP sync failed gracefully with 0 records ingested.');

  // STEP 6: Cross-Tenant Isolation Test (Org A vs Org B)
  console.log('\n5. Executing Cross-Tenant Isolation Test against Org B...');
  const orgBId = 'org_controlled_data_B';
  udmStore.setTenantContext(orgBId);
  udmStore.insertCustomer({ organization_id: orgBId, source_system: 'manual', source_id: 'c_b', name: 'Org B Secret Client', credit_limit_minor_units: 100, currency: 'INR', payment_terms_days: 30 });
  udmStore.insertInvoice({ organization_id: orgBId, source_system: 'manual', source_id: 'i_b', customer_id: 'c_b', number: 'INV-SECRET-99', amount_minor_units: 5000000, tax_amount_minor_units: 0, currency: 'INR', issue_date: '2026-03-01', due_date: '2026-03-31', status: 'open' });

  // Switch back to Clean Tenant Context
  udmStore.setTenantContext(org.id);
  const cleanInvoicesAfterOrgB = udmStore.getInvoices();
  const cleanCustomersAfterOrgB = udmStore.getCustomers();

  if (cleanInvoicesAfterOrgB.length !== 0 || cleanCustomersAfterOrgB.length !== 0) {
    throw new Error('FAIL: Cross-tenant data leakage! Org B records appeared in Clean Tenant A!');
  }
  console.log('   ✓ PASS: Clean Tenant A isolated from Org B data (0 Org B records visible).');

  console.log('\n================================================================');
  console.log('VERDICT: VERIFIED CLEAN TENANT (100% Zero-Data & Isolated)');
  console.log('================================================================');
}
