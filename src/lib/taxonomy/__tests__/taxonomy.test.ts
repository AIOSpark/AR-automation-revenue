import { analyzeInvoice } from '../../intelligence/reasoning-engine';
import { PAYMENT_DELAY_CATEGORIES, isValidTaxonomyCategory } from '../definitions';
import { udmStore } from '../../udm/store';

export async function runTaxonomyTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 14 TAXONOMY TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`🏷️ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  udmStore.clearAll();
  const orgId = 'org-taxonomy-test-14';
  udmStore.setTenantContext(orgId);

  // 1. Verify exact 11 enum members
  assert(
    PAYMENT_DELAY_CATEGORIES.length === 11,
    '1a. Taxonomy Registry - Contains exactly 11 locked category members'
  );

  // 2. Validate all Reasoning Engine outputs strictly map to the 11 categories
  const cust = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CUST_TAX_14',
    name: 'Taxonomy Corp',
    credit_limit_minor_units: 0,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv1 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_TAX_1',
    customer_id: cust.id,
    number: 'INV-TAX-1',
    amount_minor_units: 1000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    po_reference: 'PO-MISMATCH-99',
  });

  const analysis1 = await analyzeInvoice(inv1.id, orgId);
  assert(
    isValidTaxonomyCategory(analysis1.category) && analysis1.category === 'PO_MISMATCH',
    '2a. Reasoning Engine Conformance - PO Mismatch maps to locked enum PO_MISMATCH'
  );

  // 3. UNKNOWN Trigger & Routing Test
  const invSparse = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_SPARSE_99',
    customer_id: cust.id,
    number: 'INV-SPARSE-99',
    amount_minor_units: 2000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-05',
    due_date: '2026-09-05',
    status: 'written_off',
  });

  const analysisSparse = await analyzeInvoice(invSparse.id, orgId);
  assert(
    analysisSparse.category === 'UNKNOWN',
    '3a. UNKNOWN Category Routing - Sparse/Ambiguous data generates UNKNOWN category'
  );

  // 4. Invalid Category Rejection Check
  assert(
    !isValidTaxonomyCategory('INVALID_AD_HOC_CATEGORY'),
    '4a. Schema Enforcement - Rejects ad-hoc category strings outside 11-value enum'
  );

  console.log('\n==========================================');
  console.log(`TAXONOMY SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
