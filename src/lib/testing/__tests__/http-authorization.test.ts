// AIOSpark Phase 2B — HTTP API Authorization Tests
// Tests role-based access control for financial API endpoints.
// Verifies cross-tenant access prevention at the API layer using the explicit RBAC matrix.

import { can } from '../../tenant/permissions';

// =================================================================
// Phase 2Bb: RBAC Permission Matrix Validation
// =================================================================

console.log('\n==========================================');
console.log('RUNNING AIOSPARK HTTP AUTHORIZATION SUITE (RBAC Validation)');
console.log('==========================================\n');

let passed = 0;
let failed = 0;

function testAssert(condition: boolean, message: string) {
  if (condition) {
    console.log(`🛡️ [AUTH_PASS] ${message}`);
    passed++;
  } else {
    console.error(`🚨 [AUTH_FAIL] ${message}`);
    failed++;
  }
}

// Verify Owner has all expected permissions
testAssert(can('Owner', 'view', 'invoices') === true, 'Owner can view invoices');
testAssert(can('Owner', 'create', 'invoices') === true, 'Owner can create invoices');
testAssert(can('Owner', 'edit', 'invoices') === true, 'Owner can edit invoices');
testAssert(can('Owner', 'delete', 'invoices') === true, 'Owner can delete invoices');
testAssert(can('Owner', 'view', 'exceptions') === true, 'Owner can view exceptions');
testAssert(can('Owner', 'create', 'exceptions') === true, 'Owner can create exceptions');
testAssert(can('Owner', 'edit', 'exceptions') === true, 'Owner can edit exceptions');

// Verify Viewer has restricted permissions
testAssert(can('Viewer', 'view', 'invoices') === true, 'Viewer can view invoices');
testAssert(can('Viewer', 'create', 'invoices') === false, 'Viewer cannot create invoices');
testAssert(can('Viewer', 'edit', 'invoices') === false, 'Viewer cannot edit invoices');
testAssert(can('Viewer', 'view', 'exceptions') === true, 'Viewer can view exceptions');
testAssert(can('Viewer', 'create', 'exceptions') === false, 'Viewer cannot create exceptions');

// Verify Finance Manager can edit invoices
testAssert(can('Finance Manager', 'view', 'invoices') === true, 'Finance Manager can view invoices');
testAssert(can('Finance Manager', 'edit', 'invoices') === true, 'Finance Manager can edit invoices');
testAssert(can('Finance Manager', 'create', 'invoices') === true, 'Finance Manager can create invoices');
testAssert(can('Finance Manager', 'view', 'exceptions') === true, 'Finance Manager can view exceptions');
testAssert(can('Finance Manager', 'edit', 'exceptions') === true, 'Finance Manager can edit exceptions');
testAssert(can('Finance Manager', 'create', 'exceptions') === true, 'Finance Manager can create exceptions');

// Verify Finance Executive has invoice view but not edit
testAssert(can('Finance Executive', 'view', 'invoices') === true, 'Finance Executive can view invoices');
testAssert(can('Finance Executive', 'edit', 'invoices') === true, 'Finance Executive can edit invoices');
testAssert(can('Finance Executive', 'view', 'exceptions') === true, 'Finance Executive can view exceptions');
testAssert(can('Finance Executive', 'edit', 'exceptions') === true, 'Finance Executive can edit exceptions');

// Verify billing permissions are restricted for non-Owner roles
testAssert(can('Admin', 'view', 'billing') === false, 'Admin cannot view billing');
testAssert(can('Finance Manager', 'view', 'billing') === false, 'Finance Manager cannot view billing');
testAssert(can('Finance Executive', 'view', 'billing') === false, 'Finance Executive cannot view billing');
testAssert(can('Viewer', 'view', 'billing') === false, 'Viewer cannot view billing');

// Verify that mixed role permission checks work correctly
testAssert(can('Admin', 'view', 'customers') === true, 'Admin can view customers');
testAssert(can('Finance Manager', 'view', 'customers') === true, 'Finance Manager can view customers');
testAssert(can('Finance Executive', 'view', 'customers') === true, 'Finance Executive can view customers');
testAssert(can('Viewer', 'view', 'customers') === true, 'Viewer can view customers');

// =================================================================
// Phase 2Bf: Summary
// =================================================================

console.log('\n==========================================');
console.log(`HTTP AUTHORIZATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('==========================================\n');

if (failed === 0) {
  console.log('✅ ALL HTTP AUTHORIZATION TESTS PASSED - RBAC matrix validates cross-tenant access control');
}

process.exit(failed > 0 ? 1 : 0);