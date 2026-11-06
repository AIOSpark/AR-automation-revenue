// AIOSpark Active Collections Agent (Agent 3 - Layer 19)
// Purpose: Proposes template-based customer payment reminders/document requests routed through Layer 18 Approval System.
// Strict Constraint: Never generates freeform text. Only populates structured template variables.

import { udmStore } from '../udm/store';
import { AgentExecutor, AgentExecutionResult } from './executor';
import { communicationStore, CommunicationContentType } from '../communication/store';
import { Invoice, Customer } from '../udm/types';

export interface CollectionsAgentInput {
  organizationId: string;
  invoiceId: string;
  contentType?: CommunicationContentType;
  documentTypeRequested?: string;
  disputeReason?: string;
  requestedClarification?: string;
}

export interface CollectionsProposalData {
  contentType: CommunicationContentType;
  customerId: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  body: string;
  variables: Record<string, any>;
}

export async function runCollectionsAgent(
  input: CollectionsAgentInput
): Promise<AgentExecutionResult<CollectionsProposalData>> {
  return AgentExecutor.run<CollectionsAgentInput, CollectionsProposalData>(
    'Collections Agent',
    input.organizationId,
    input,
    async (params: CollectionsAgentInput) => {
      const modelCall = await AgentExecutor.callModel<CollectionsProposalData>(
        `Select and populate communication template for invoice ${params.invoiceId}`,
        async () => {
          udmStore.setTenantContext(params.organizationId);

          const invoices = udmStore.getInvoices();
          const invoice = invoices.find((i) => i.id === params.invoiceId);
          if (!invoice) {
            throw new Error(`Invoice not found: ${params.invoiceId}`);
          }

          const customers = udmStore.getCustomers();
          const customer = customers.find((c) => c.id === invoice.customer_id);
          if (!customer) {
            throw new Error(`Customer not found for invoice: ${params.invoiceId}`);
          }

          const contacts = udmStore.getContacts(customer.id);
          const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];
          // Never invent a recipient. The proposal can still be reviewed, but
          // approval execution must require a verified customer contact.
          const recipientEmail = primaryContact?.email || '';

            const contentType: CommunicationContentType = params.contentType || 'payment_reminder';

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

            // Populate variables based on content type
            const variables: Record<string, any> = {
              customer_name: customer.name,
              company_name: 'AIOSpark Finance',
              sender_name: 'AR Operations Team',
              invoice_number: invoice.number,
              amount: formattedAmount,
              due_date: invoice.due_date,
              days_overdue: daysOverdue,
            };

            if (contentType === 'document_request') {
              if (!params.documentTypeRequested) {
                throw new Error("Missing required variable 'document_type' for document request template");
              }
              variables.document_type = params.documentTypeRequested;
            } else if (contentType === 'dispute_clarification') {
              const disputes = udmStore.getDisputes().filter((d) => d.invoice_id === invoice.id);
              const dispute = disputes.length > 0 ? disputes[0] : null;
              const reason = params.disputeReason || dispute?.reason;
              if (!reason) {
                throw new Error("Missing required variable 'dispute_reason' for dispute clarification template");
              }
              variables.dispute_reason = reason;
              variables.requested_clarification = params.requestedClarification || 'Please confirm purchase order approval status';
            }

            // Populate template strictly
            const { subject, body } = communicationStore.populateTemplate({
              organization_id: params.organizationId,
              content_type: contentType,
              variables,
            });

            const proposalData: CollectionsProposalData = {
              contentType,
              customerId: customer.id,
              customerName: customer.name,
              customerEmail: recipientEmail,
              subject,
              body,
              variables,
            };

            // Propose action as SEND_CUSTOMER_COMMUNICATION (Layer 18 Mandatory Approval Action Type)
            return proposalData;
          }
        )
      ;

      return {
        data: modelCall.result,
        proposedAction: {
          targetEntity: 'invoice',
          targetId: input.invoiceId,
          actionType: 'SEND_CUSTOMER_COMMUNICATION',
          payload: {
            invoice_id: input.invoiceId,
            customer_id: modelCall.result.customerId,
            content_type: modelCall.result.contentType,
            recipient_email: modelCall.result.customerEmail,
            subject: modelCall.result.subject,
            body: modelCall.result.body,
            variables: modelCall.result.variables,
          },
        },
      };
    }
  );
}
