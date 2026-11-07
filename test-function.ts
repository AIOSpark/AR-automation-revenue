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

// Regular (non-export, non-async) function
function runTest() {
  const invoices = udmStore.getInvoices();
  const found = invoices.find(i => i.id === 'some-id');
  if (found) {
    const balance = getInvoiceOutstandingBalance(found);
    testAssert(balance !== undefined, 'Balance check');
  }
}

runTest();
