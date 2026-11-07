import { udmStore } from './src/lib/udm/store';
import type { Invoice } from './src/lib/udm/types';
import { getInvoiceOutstandingBalance } from '@/dashboard/engine';
import { executionService } from '@/execution/service';
import { executionStore } from '@/execution/store';
import { approvalStore } from '@/approvals/store';

function testAssert(condition: boolean, message: string) {
  if (condition) {
    console.log(`💰 [STRESS_PASS] ${message}`);
  } else {
    console.error(`🚨 [STRESS_FAIL] ${message}`);
  }
}

udmStore.clearAll();
udmStore.setTenantContext('org_stress_test');
executionStore.clearAll();
approvalStore.clearAll();

export async function runFinancialStressTestSuite() {
  const testOrg = 'org_stress_test';
  
  // Test simple find
  const invoices = udmStore.getInvoices();
  const found = invoices.find(i => i.id === 'some-id');
  if (found) {
    const balance = getInvoiceOutstandingBalance(found);
  }
}
