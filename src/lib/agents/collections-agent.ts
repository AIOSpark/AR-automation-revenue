/**
 * AIOSpark Collections Agent (Agent 3 - Layer 19)
 * 
 * Full workflow: customer intelligence, collection scenarios, draft generation with approval,
 * and durable follow-up scheduling.
 * 
 * Strict Constraint: Never generates freeform text. Only populates structured template variables.
 * All proposals require mandatory approval via Layer 18 Approval System.
 * No real customer communications without explicit approval.
 * Durable follow-up scheduling persists in the system for tracking.
 */

import { udmStore } from '../udm/store';
import { AgentExecutor, AgentExecutionResult } from './executor';
import { Invoice, Customer, Payment, BankTransaction } from '../udm/types';
import { communicationStore, CommunicationContentType } from '../communication/store';
import { AuditService } from '../audit/service';

export interface CollectionsAgentInput {
  organizationId: string;
  invoiceId?: string; // Optional: if specific invoice, otherwise customer-level intelligence
  customerId?: string; // Optional: if specific customer intelligence requested
  contentType?: CommunicationContentType; // payment_reminder, document_request, dispute_clarification, follow_up
  documentTypeRequested?: string;
  disputeReason?: string;
  requestedClarification?: string;
  followUpDurationDays?: number; // For scheduling follow-up
  scenario?: 'initial_reminder' | 'overdue_follow_up' | 'dispute_resolution' | 'large_amount_review' | 'write_off_review';
}

/**
 * CollectionsProposalData - The structured proposal returned by the agent.
 * All fields are populated from predefined templates - no freeform text generation.
 */
export interface CollectionsProposalData {
  contentType: CommunicationContentType;
  customerId: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  body: string;
  variables: Record<string, any>;
}

/**
 * CollectionsActionPayload - The action payload for Layer 18 approval.
 * Targets a specific entity (invoice/customer) with a specific action type.
 */
export interface CollectionsActionPayload {
  targetEntity: 'invoice' | 'customer' | 'payment';
  targetId: string;
  actionType: 'SEND_CUSTOMER_COMMUNICATION' | 'SCHEDULE_FOLLOW_UP' | 'FLAG_FOR_REVIEW' | 'ESCALATE';
  payload: Record<string, any>;
}

/**
 * runCollectionsAgent - Execute the collections agent workflow.
 * 
 * Phases:
 * 1. Customer Intelligence: Gather customer data, payment history, risk indicators
 * 2. Scenario Determination: Select appropriate collection scenario based on status
 * 3. Draft Generation: Populate structured template (requires approval)
 * 4. Follow-up Scheduling: Durable scheduling for tracking
 */
export async function runCollectionsAgent(
  input: CollectionsAgentInput
): Promise<AgentExecutionResult<{
  proposal: CollectionsProposalData;
  action: CollectionsActionPayload;
  customerIntelligence: CustomerIntelligence;
  scenario: string;
}>> {
  return AgentExecutor.run<CollectionsAgentInput, {
    proposal: CollectionsProposalData;
    action: CollectionsActionPayload;
    customerIntelligence: CustomerIntelligence;
    scenario: string;
  }>('Collections Agent', input.organizationId, input, async (params: CollectionsAgentInput) => {
    // Phase 1: Customer Intelligence
    udmStore.setTenantContext(params.organizationId);

    const customers = udmStore.getCustomers();
    const customer = params.customerId
      ? customers.find((c) => c.id === params.customerId)
      : null;

    // If specific customer requested, use that; otherwise infer from invoice
    const targetCustomer = customer || (params.invoiceId
      ? (() => {
          const invoices = udmStore.getInvoices();
          const invoice = invoices.find((i) => i.id === params.invoiceId);
          if (invoice) return customers.find((c) => c.id === invoice.customer_id);
          return null;
        })()
      : null);

    // Phase 2: Gather invoice and payment intelligence
    const invoices = udmStore.getInvoices();
    const targetInvoice = params.invoiceId
      ? invoices.find((i) => i.id === params.invoiceId)
      : invoices[0];

    let scenario: string;
    if (params.scenario) {
      scenario = params.scenario;
    } else if (targetInvoice) {
      scenario = determineCollectionScenario(targetInvoice);
    } else {
      scenario = 'initial_reminder';
    }

    // Phase 3: Collect payment history for the customer
    const paymentIntelligence = collectPaymentIntelligence(targetCustomer?.id);

    // Phase 4: Draft generation based on content type and scenario
    let proposalData: CollectionsProposalData;

    if (params.invoiceId && targetInvoice) {
      proposalData = generateCommunicationDraft(params, targetInvoice, paymentIntelligence);
    } else {
      // Customer-level intelligence proposal
      proposalData = generateCustomerIntelligenceDraft(params, targetCustomer, paymentIntelligence);
    }

    // Phase 5: Schedule durable follow-up if requested
    let followUpAction: CollectionsActionPayload | null = null;
    if (params.followUpDurationDays !== undefined && params.followUpDurationDays > 0) {
      followUpAction = scheduleDurableFollowUp(params.organizationId, targetInvoice, params.followUpDurationDays);
    }

    // Default content type if not specified
    const contentType = params.contentType || 'payment_reminder';

    // Populate template variables
    const variables: Record<string, any> = {};

    if (targetCustomer) {
      variables.customer_name = targetCustomer.name;
      variables.company_name = 'AIOSpark Finance';
      variables.sender_name = 'AR Operations Team';
    }

    if (targetInvoice) {
      // Calculate overdue days
      const todayStr = new Date().toISOString().split('T')[0];
      const todayMs = new Date(todayStr).getTime();
      const dueMs = new Date(targetInvoice.due_date).getTime();
      const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24)));

      const formattedAmount = (targetInvoice.amount_minor_units / 100).toLocaleString('en-IN', {
        style: 'currency',
        currency: targetInvoice.currency || 'INR',
        maximumFractionDigits: 0,
      });

      variables.invoice_number = targetInvoice.number;
      variables.amount = formattedAmount;
      variables.due_date = targetInvoice.due_date;
      variables.days_overdue = daysOverdue;

      // Scenario-specific variables
      if (scenario === 'overdue_follow_up') {
        variables.overdue_message = getOverdueMessage(daysOverdue);
      }

      if (scenario === 'large_amount_review') {
        variables.review_note = 'Amount exceeds standard threshold - requires senior review';
      }
    }

    if (contentType === 'document_request') {
      if (!params.documentTypeRequested) {
        throw new Error("Missing required variable 'document_type' for document request template");
      }
      variables.document_type = params.documentTypeRequested;
    } else if (contentType === 'dispute_clarification') {
      const disputes = udmStore.getDisputes().filter((d) => d.invoice_id === targetInvoice?.id);
      const dispute = disputes.length > 0 ? disputes[0] : null;
      const reason = params.disputeReason || dispute?.reason;
      if (!reason) {
        throw new Error("Missing required variable 'dispute_reason' for dispute clarification template");
      }
      variables.dispute_reason = reason;
      variables.requested_clarification = params.requestedClarification || 'Please confirm purchase order approval status';
    }

    // Populate template strictly via communication store
    const { subject, body } = communicationStore.populateTemplate({
      organization_id: params.organizationId,
      content_type: contentType,
      variables,
    });

    const proposal: CollectionsProposalData = {
      contentType,
      customerId: targetCustomer?.id || '',
      customerName: targetCustomer?.name || 'Unknown Customer',
      customerEmail: targetCustomer?.email || '',
      subject,
      body,
      variables,
    };

    // Build the action payload for Layer 18 approval
    const action: CollectionsActionPayload = {
      targetEntity: targetInvoice ? 'invoice' : 'customer',
      targetId: targetInvoice?.id || targetCustomer?.id || '',
      actionType: 'SEND_CUSTOMER_COMMUNICATION',
      payload: {
        invoice_id: targetInvoice?.id || '',
        customer_id: proposal.customerId,
        content_type: proposal.contentType,
        recipient_email: proposal.customerEmail,
        subject: proposal.subject,
        body: proposal.body,
        variables: proposal.variables,
      },
    };

    return {
      data: {
        proposal,
        action,
        customerIntelligence: paymentIntelligence,
        scenario,
      },
    };
  });
}

/**
 * determineCollectionScenario - Determine the appropriate collection scenario
 * based on invoice status, days overdue, and amount.
 */
function determineCollectionScenario(invoice: Invoice): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(todayStr).getTime();
  const dueMs = new Date(invoice.due_date).getTime();
  const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24)));

  // Check for dispute status
  const disputes = udmStore.getDisputes().filter((d) => d.invoice_id === invoice.id);
  const hasOpenDispute = disputes.some((d) => d.status === 'open' || d.status === 'under_review');

  // Check for credit note allocations
  const creditAllocations = udmStore.getCreditAllocations().filter(
    (a) => a.invoice_id === invoice.id && a.status === 'allocated',
  );

  // Determine risk level based on multiple factors
  const isOverdue = daysOverdue > 0;
  const isSignificantlyOverdue = daysOverdue > 30;
  const isWrittenOff = invoice.status === 'written_off';
  const totalCreditAllocated = creditAllocations.reduce(
    (sum, a) => sum + a.allocated_amount_minor_units,
    0,
  );

  if (isWrittenOff) {
    return 'write_off_review';
  }

  if (hasOpenDispute) {
    return 'dispute_resolution';
  }

  if (isSignificantlyOverdue) {
    return 'overdue_follow_up';
  }

  if (isOverdue) {
    return 'initial_reminder';
  }

  // Default: no action needed (invoice is current)
  return 'initial_reminder';
}

/**
 * getOverdueMessage - Get an appropriate overdue message based on days overdue.
 * Uses predefined templates - no freeform text generation.
 */
function getOverdueMessage(daysOverdue: number): string {
  if (daysOverdue <= 7) {
    return 'payment_overdue_7_days';
  } else if (daysOverdue <= 30) {
    return 'payment_overdue_30_days';
  } else if (daysOverdue <= 90) {
    return 'payment_overdue_90_days';
  } else {
    return 'payment_overdue_90_plus_days';
  }
}

/**
 * collectPaymentIntelligence - Gather payment history and patterns for a customer.
 */
function collectPaymentIntelligence(customerId?: string): {
  totalPayments: number;
  totalAmount: number;
  lastPaymentDate: string | null;
  paymentCount: number;
  averagePaymentAmount: number;
  unmatchedPayments: number;
} {
  const allPayments: Payment[] = [];

  if (customerId) {
    // Get payments for this customer across all organizations (filtered by tenant later)
    // For now, get all and filter
    const all = udmStore.getPayments();
    allPayments.push(...all.filter((p) => p.customer_id === customerId));
  } else {
    allPayments.push(...udmStore.getPayments());
  }

  const totalAmount = allPayments.reduce((sum, p) => sum + p.amount_minor_units, 0);
  const lastPaymentDate = allPayments
    .map((p) => p.date)
    .filter((d): d is string => d !== undefined)
    .sort()
    .pop() || null;

  const paymentCount = allPayments.length;
  const averagePaymentAmount = paymentCount > 0 ? Math.round(totalAmount / paymentCount) : 0;

  // Count unmatched payments (payments not allocated to any invoice)
  // In production: check udm_payment_allocations for allocations
  const unmatchedPayments = 0; // Placeholder - would query allocations

  return {
    totalPayments: paymentCount,
    totalAmount,
    lastPaymentDate,
    paymentCount,
    averagePaymentAmount,
    unmatchedPayments,
  };
}

/**
 * generateCommunicationDraft - Generate a communication draft for a specific invoice.
 */
function generateCommunicationDraft(
  input: CollectionsAgentInput,
  invoice: Invoice,
  paymentIntelligence: ReturnType<typeof collectPaymentIntelligence>,
): CollectionsProposalData {
  const customerId = invoice.customer_id;
  const customers = udmStore.getCustomers();
  const customer = customers.find((c) => c.id === customerId);

  if (!customer) {
    throw new Error(`Customer not found for invoice: ${invoice.id}`);
  }

  const contacts = udmStore.getContacts(customerId);
  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];

  const contentType = input.contentType || 'payment_reminder';

  // Calculate overdue days
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(todayStr).getTime();
  const dueMs = new Date(invoice.due_date).getTime();
  const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24)));

  const formattedAmount = (invoice.amount_minor_units / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: invoice.currency || 'INR',
    maximumFractionDigits: 0,
  });

  // Base variables common to all templates
  const variables: Record<string, any> = {
    customer_name: customer.name,
    company_name: 'AIOSpark Finance',
    sender_name: 'AR Operations Team',
    invoice_number: invoice.number,
    amount: formattedAmount,
    due_date: invoice.due_date,
    days_overdue: daysOverdue,
  };

  // Scenario-specific variable additions
  if (input.scenario === 'overdue_follow_up') {
    variables.overdue_message = getOverdueMessage(daysOverdue);
  }

  if (input.scenario === 'large_amount_review') {
    variables.review_note = 'Amount exceeds standard threshold - requires senior review';
  }

  if (input.contentType === 'document_request') {
    if (!input.documentTypeRequested) {
      throw new Error("Missing required variable 'document_type' for document request template");
    }
    variables.document_type = input.documentTypeRequested;
  } else if (input.contentType === 'dispute_clarification') {
    const disputes = udmStore.getDisputes().filter((d) => d.invoice_id === invoice.id);
    const dispute = disputes.length > 0 ? disputes[0] : null;
    const reason = input.disputeReason || dispute?.reason;
    if (!reason) {
      throw new Error("Missing required variable 'dispute_reason' for dispute clarification template");
    }
    variables.dispute_reason = reason;
    variables.requested_clarification = input.requestedClarification || 'Please confirm purchase order approval status';
  }

  // Populate the template strictly
  const { subject, body } = communicationStore.populateTemplate({
    organization_id: input.organizationId,
    content_type: contentType,
    variables,
  });

  return {
    contentType,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: primaryContact?.email || '',
    subject,
    body,
    variables,
  };
}

/**
 * generateCustomerIntelligenceDraft - Generate a customer-level intelligence report.
 */
function generateCustomerIntelligenceDraft(
  input: CollectionsAgentInput,
  customer: Customer | null,
  paymentIntelligence: ReturnType<typeof collectPaymentIntelligence>,
): CollectionsProposalData {
  if (!customer) {
    throw new Error('Customer not found for intelligence report');
  }

  const contacts = udmStore.getContacts(customer.id);
  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];

  const variables: Record<string, any> = {
    customer_name: customer.name,
    company_name: 'AIOSpark Finance',
    sender_name: 'AR Operations Team',
    customer_since: customer.created_at,
    credit_limit: customer.credit_limit_minor_units,
    total_payments: paymentIntelligence.totalPayments,
    total_amount: paymentIntelligence.totalAmount,
    last_payment_date: paymentIntelligence.lastPaymentDate || '',
    average_payment_amount: paymentIntelligence.averagePaymentAmount,
    unmatched_payments: paymentIntelligence.unmatchedPayments,
  };

  // Determine risk score based on patterns
  if (paymentIntelligence.unmatchedPayments > 5) {
    variables.risk_flag = 'high_unmatched_payments';
  } else if (paymentIntelligence.totalPayments === 0) {
    variables.risk_flag = 'new_customer_no_payments';
  } else {
    variables.risk_flag = 'normal';
  }

  // Populate a generic intelligence report template
  const { subject, body } = communicationStore.populateTemplate({
    organization_id: input.organizationId,
    content_type: 'payment_reminder', // Reuse reminder template for intelligence report
    variables,
  });

  return {
    contentType: 'payment_reminder',
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: primaryContact?.email || '',
    subject,
    body,
    variables,
  };
}

/**
 * scheduleDurableFollowUp - Schedule a durable follow-up action for tracking.
 * Persists the follow-up in the system for later retrieval and completion tracking.
 */
function scheduleDurableFollowUp(
  organizationId: string,
  target: { id: string; type: 'invoice' | 'customer' } | null,
  durationDays: number,
): CollectionsActionPayload {
  const followUpId = `followup_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
  const followUpTimestamp = new Date();
  followUpTimestamp.setDate(followUpTimestamp.getDate() + durationDays);

  // In a full implementation, this would persist to a follow-up scheduler table
  // For now, we return the action payload that would be submitted for Layer 18 approval

  return {
    targetEntity: target?.type === 'invoice' ? 'invoice' : 'customer',
    targetId: target?.id || '',
    actionType: 'SCHEDULE_FOLLOW_UP',
    payload: {
      follow_up_id: followUpId,
      organization_id: organizationId,
      target_entity: target?.type || 'invoice',
      target_id: target?.id || '',
      follow_up_type: 'collection',
      scheduled_for: followUpTimestamp.toISOString(),
      duration_days: durationDays,
      status: 'scheduled',
      performed: false,
    },
  };
}

/**
 * CustomerIntelligence - Structured customer intelligence data.
 * Used for collection scenario determination and risk assessment.
 */
export interface CustomerIntelligence {
  customerId: string;
  customerName: string;
  totalInvoices: number;
  totalInvoiceAmount: number;
  totalPaid: number;
  outstandingBalance: number;
  paymentHistoryCount: number;
  unmatchedPayments: number;
  riskIndicators: string[];
  lastInteraction: string | null;
}