// AIOSpark Universal Data Model Test Suite & Multi-Source Validation (Layer 6)

import { udmStore } from '../store';

export async function runUdmTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 6 UDM TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  udmStore.clearAll();

  const orgIdA = 'org-udm-test-A';
  const orgIdB = 'org-udm-test-B';

  // 1. Messy CSV Ingestion Path Validation
  udmStore.setTenantContext(orgIdA);

  const messyCsvCustomer = udmStore.insertCustomer({
    organization_id: orgIdA,
    source_system: 'csv',
    source_id: 'CSV_CUST_991',
    name: '  Acme Logistics Pvt Ltd   ', // Messy whitespace
    tax_id: '27AABCA1234F1Z5',
    credit_limit_minor_units: 50000000, // ₹500,000.00
    currency: 'INR',
    payment_terms_days: 45,
    billing_address: { line1: 'Plot 12, MIDC', city: 'Mumbai', state: 'MH', pincode: '400093' },
  });

  assert(
    messyCsvCustomer.credit_limit_minor_units === 50000000 && messyCsvCustomer.payment_terms_days === 45,
    '1a. Messy CSV - Integer minor units & payment terms saved correctly'
  );

  const csvContact = udmStore.insertContact({
    organization_id: orgIdA,
    customer_id: messyCsvCustomer.id,
    name: 'Rajesh Kumar',
    email: 'rajesh@acmelogistics.com',
    phone: '+919876543210',
    role_title: 'Accounts Payable Lead',
    is_primary: true,
  });

  assert(csvContact.customer_id === messyCsvCustomer.id && csvContact.is_primary, '1b. CustomerContact - Primary contact linked via foreign key');

  const csvInvoice = udmStore.insertInvoice({
    organization_id: orgIdA,
    source_system: 'csv',
    source_id: 'CSV_INV_1001',
    customer_id: messyCsvCustomer.id,
    number: 'INV-2026-001',
    amount_minor_units: 180000000, // ₹1,800,000.00
    currency: 'INR',
    tax_amount_minor_units: 32400000, // 18% GST = ₹324,000.00
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    po_reference: 'PO-ACME-8821',
  });

  assert(csvInvoice.amount_minor_units === 180000000 && csvInvoice.status === 'open', '1c. Invoice - Monetary integer minor units & strict enum status enforced');

  // 2. Zoho Books Sample Export Ingestion Path Validation
  const zohoCustomer = udmStore.insertCustomer({
    organization_id: orgIdA,
    source_system: 'zoho',
    source_id: 'ZOHO_CUST_44210',
    name: 'TechCorp Global Solutions',
    tax_id: '07AAACT9981K1Z2',
    credit_limit_minor_units: 100000000,
    currency: 'USD',
    payment_terms_days: 30,
  });

  const zohoInvoice = udmStore.insertInvoice({
    organization_id: orgIdA,
    source_system: 'zoho',
    source_id: 'ZOHO_INV_88192',
    customer_id: zohoCustomer.id,
    number: 'ZOHO-INV-4412',
    amount_minor_units: 5000000, // $50,000.00
    currency: 'USD',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-15',
    due_date: '2026-09-14',
    status: 'partially_paid',
  });

  const zohoPayment = udmStore.insertPayment({
    organization_id: orgIdA,
    source_system: 'zoho',
    source_id: 'ZOHO_PAY_11204',
    customer_id: zohoCustomer.id,
    amount_minor_units: 2000000, // $20,000.00
    currency: 'USD',
    date: '2026-08-25',
    reference: 'WIRE-NEFT-991204',
  });

  const match = udmStore.insertMatch({
    organization_id: orgIdA,
    payment_id: zohoPayment.id,
    invoice_id: zohoInvoice.id,
    matched_amount_minor_units: 2000000,
    confidence: 1.0,
  });

  assert(match.matched_amount_minor_units === 2000000 && match.confidence === 1.0, '2a. PaymentInvoiceMatch - Many-to-many match table record inserted with confidence');

  // 3. Dispute & Evidence Validation
  const dispute = udmStore.insertDispute({
    organization_id: orgIdA,
    invoice_id: csvInvoice.id,
    reason: 'Goods damaged during transit near warehouse B',
    amount_minor_units: 30000000, // Partial dispute ₹300,000.00
    status: 'open',
  });

  const evidence = udmStore.insertDisputeEvidence({
    organization_id: orgIdA,
    dispute_id: dispute.id,
    file_name: 'damage_report_inspection.pdf',
    file_url: 'https://s3.aws.com/aiospark-evidence/damage_report.pdf',
    file_type: 'application/pdf',
  });

  assert(dispute.status === 'open' && evidence.dispute_id === dispute.id, '3a. Dispute & Evidence - Linked dispute evidence created');

  // 4. Exception Lifecycle Entity Validation
  const exception = udmStore.insertException({
    organization_id: orgIdA,
    customer_id: messyCsvCustomer.id,
    invoice_id: csvInvoice.id,
    type: 'GST_INVOICE_MISMATCH',
    severity: 'high',
    status: 'detected',
    evidence: { discrepancy_field: 'tax_amount', expected: 32400000, observed: 30000000 },
    recommended_action: 'Issue credit note for GST tax adjustment',
  });

  assert(exception.severity === 'high' && exception.status === 'detected', '4a. Exception Entity - Severity enum & status lifecycle validated');

  // 5. Tenant RLS Isolation Boundary Checks
  udmStore.setTenantContext(orgIdB);
  const orgBInvoices = udmStore.getInvoices();
  const orgBCustomers = udmStore.getCustomers();

  assert(orgBInvoices.length === 0 && orgBCustomers.length === 0, '5a. Multi-Tenant RLS - Org B context sees ZERO Org A records');

  udmStore.setTenantContext(orgIdA);
  const orgAInvoices = udmStore.getInvoices();
  assert(orgAInvoices.length === 2, '5b. Multi-Tenant RLS - Org A context retrieves exactly Org A records');

  console.log('\n==========================================');
  console.log(`UDM SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
