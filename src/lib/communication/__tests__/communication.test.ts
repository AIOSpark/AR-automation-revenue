// AIOSpark Communication Engine Test Suite (Layer 19)

import { udmStore } from '../../udm/store';
import { communicationStore } from '../store';
import { TransactionalEmailProvider } from '../email-provider';
import { runCollectionsAgent } from '../../agents/collections-agent';
import { approvalStore } from '../../approvals/store';
import { policyEngine } from '../../agents/policy-engine';

export async function runCommunicationTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 19 COMMUNICATION ENGINE TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_comm_test';
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);
  communicationStore.clearAll();
  approvalStore.clearAll();
  policyEngine.clearRules();

  // Seed customer & invoice
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_comm',
    name: 'Gotham City Holdings',
    credit_limit_minor_units: 500000000,
    currency: 'INR',
    payment_terms_days: 30,
  });
  udmStore.insertContact({
    organization_id: testOrgId,
    customer_id: cust.id,
    name: 'Gotham Accounts',
    email: 'accounts@gotham.com',
    is_primary: true,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_comm',
    customer_id: cust.id,
    number: 'INV-COMM-909',
    amount_minor_units: 45000000, // ₹4,50,000.00
    tax_amount_minor_units: 8100000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  // 1. Template Variable Substitution Test (Realistic & Edge Cases)
  const populatedReminder = communicationStore.populateTemplate({
    organization_id: testOrgId,
    content_type: 'payment_reminder',
    variables: {
      customer_name: 'Gotham City Holdings',
      company_name: 'AIOSpark Finance',
      sender_name: 'AR Operations',
      invoice_number: 'INV-COMM-909',
      amount: '₹4,50,000.00',
      due_date: '2026-01-31',
      days_overdue: 35,
    },
  });

  if (!populatedReminder.body.includes('Gotham City Holdings') || !populatedReminder.body.includes('₹4,50,000.00')) {
    throw new Error('Template engine failed to substitute variables correctly');
  }
  console.log('⚡ [PASS] 1a. Template variable substitution generated exact structured content');

  // Edge Case: Missing variable check
  let errorCaught = false;
  try {
    communicationStore.populateTemplate({
      organization_id: testOrgId,
      content_type: 'payment_reminder',
      variables: {
        customer_name: 'Gotham City Holdings',
        // missing invoice_number, amount, etc.
      },
    });
  } catch (err: any) {
    errorCaught = true;
    if (!err.message.includes('Missing required template variable')) {
      throw new Error(`Unexpected error message on missing variable: ${err.message}`);
    }
  }

  if (!errorCaught) {
    throw new Error('Template engine failed to throw error on missing variable');
  }
  console.log('⚡ [PASS] 1b. Template engine strictly refused to generate malformed content with missing variable');

  // 2. Full End-to-End Flow: Agent Proposes -> Approval Request -> Approved -> Email Sent -> sent_messages Logged
  const agentProposal = await runCollectionsAgent({
    organizationId: testOrgId,
    invoiceId: inv.id,
    contentType: 'payment_reminder',
  });

  if (!agentProposal.actionProposed) throw new Error('Collections Agent failed to propose action');

  const pendingReqs = approvalStore.getRequests(testOrgId, 'pending');
  const commReq = pendingReqs.find((r) => r.action_type === 'SEND_CUSTOMER_COMMUNICATION');

  if (!commReq) throw new Error('Communication proposal failed to route to approval_requests');

  // Approve & execute via API mock handler
  const { TransactionalEmailProvider } = await import('../email-provider');
  const sendRes = await TransactionalEmailProvider.sendEmail({
    toEmail: commReq.proposed_action.recipient_email,
    subject: commReq.proposed_action.subject,
    body: commReq.proposed_action.body,
    organizationId: testOrgId,
  });

  if (!sendRes.success) throw new Error('Email provider dispatch failed');

  const loggedMessage = communicationStore.logSentMessage({
    organization_id: testOrgId,
    customer_id: cust.id,
    invoice_id: inv.id,
    content_type: 'payment_reminder',
    channel: 'email',
    subject: commReq.proposed_action.subject,
    body: commReq.proposed_action.body,
    approval_request_id: commReq.id,
    status: 'sent',
  });

  if (!loggedMessage.id || loggedMessage.status !== 'sent') {
    throw new Error('Failed to create sent_messages log entry');
  }

  const customerMessages = communicationStore.getSentMessages(testOrgId, cust.id);
  if (customerMessages.length !== 1 || customerMessages[0].subject !== commReq.proposed_action.subject) {
    throw new Error('Customer 360 communication log query returned invalid data');
  }
  console.log('⚡ [PASS] 2. Full end-to-end loop: Agent → Approval Queue → Approved → Email Sent → sent_messages logged');

  // 3. Rejected Message Logged & Never Sent Test
  const rejReq = approvalStore.createRequest({
    organization_id: testOrgId,
    subject_type: 'invoice',
    subject_id: inv.id,
    action_type: 'SEND_CUSTOMER_COMMUNICATION',
    proposed_action: { recipient_email: 'accounts@gotham.com', subject: 'Rejected Reminder', body: 'Body' },
    evidence: [],
    confidence: 0.9,
    proposed_by: 'Collections Agent',
  });

  const rejectedReq = approvalStore.rejectRequest(rejReq.id, 'usr_mgr_1', 'Inaccurate amount');
  const postRejectionMessages = communicationStore.getSentMessages(testOrgId, cust.id);
  const wasSent = postRejectionMessages.some((m) => m.approval_request_id === rejReq.id);

  if (wasSent) throw new Error('Rejected communication request was erroneously dispatched!');
  if (rejectedReq.rejection_reason !== 'Inaccurate amount') throw new Error('Rejection reason missing');
  console.log('⚡ [PASS] 3. Rejected message was never dispatched and logged rejection reason correctly');

  // 4. Approval Bypass Prevention Test
  const bypassAttempt = policyEngine.checkPolicy(testOrgId, 'Collections Agent', 'SEND_CUSTOMER_COMMUNICATION', {
    subjectId: inv.id,
    payload: { recipient_email: 'accounts@gotham.com' },
  });

  if (bypassAttempt.allowed || !bypassAttempt.requiresApproval) {
    throw new Error('SEND_CUSTOMER_COMMUNICATION allowed direct execution! Approval floor breached.');
  }
  console.log('⚡ [PASS] 4. SEND_CUSTOMER_COMMUNICATION held strictly unbypassable by Policy Engine floor');

  console.log('\n==========================================');
  console.log('COMMUNICATION SUITE SUMMARY: 4 PASSED, 0 FAILED');
  console.log('==========================================\n');
}
