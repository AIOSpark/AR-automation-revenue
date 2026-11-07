import { udmStore } from './src/lib/udm/store';
import type { Invoice } from './src/lib/udm/types';
import { getInvoiceOutstandingBalance } from '@/dashboard/engine';
import { executionService } from '@/execution/service';
import { approvalStore } from '@/approvals/store';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const invoices = udmStore.getInvoices();
const found = invoices.find(i => i.id === 'some-id');
if (found) {
  const balance = getInvoiceOutstandingBalance(found);
  console.log('Balance:', balance);
}

const approval = approvalStore.createRequest({
  organization_id: 'test-org',
  subject_type: 'invoice',
  subject_id: 'inv-1',
  action_type: 'RECORD_PAYMENT_MATCH',
  proposed_action: {
    invoice_id: 'inv-1',
    payment_id: 'pay-1',
    amount_minor_units: 10000000,
    match_method: 'manual',
  },
  evidence: [],
  confidence: 0.95,
  proposed_by: 'agent_test',
});
approval.approveRequest(approval.id, 'user_reviewer_1');

const result = executionService.executeApprovedAction(approval.id, {
  userId: 'user_reviewer_1',
  organizationId: 'test-org',
});
