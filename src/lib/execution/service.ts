// AIOSpark Phase 4 - Central Financial Execution Service

import { executionStore } from './store';
import { approvalStore } from '../approvals/store';
import { udmStore } from '../udm/store';
import { getInvoiceOutstandingBalance } from '../dashboard/engine';
import { can } from '../tenant/permissions';
import { auditStore } from '../audit/store';
import { ExecutionRecord, ExecutionContext, ActionType } from './types';
import { durableVerifier } from './durable-verifier';
import crypto from 'crypto';
import { getRequestTenant } from '../tenant/request-context';
import { validatePilotReadOnly } from '../auth/pilot';

function hashPayload(payload: any): string {
  const str = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

export class ExecutionService {
  /**
   * Execute approved action through centralized service
   */
  public async executeApprovedAction(
    actionId: string,
    context: ExecutionContext,
    idempotencyKey?: string
  ): Promise<{ success: boolean; executionId: string; state: string; message: string }> {
    // Check idempotency
    if (idempotencyKey) {
      const existing = executionStore.getByIdempotencyKey(context.organizationId, idempotencyKey);
      if (existing) {
        // If already committed/verified, return existing result (idempotent replay)
        if (existing.state === 'verified' || existing.state === 'committed') {
          return {
            success: true,
            executionId: existing.id,
            state: existing.state,
            message: 'Action already executed (idempotent replay)',
          };
        }
        // If in progress, return current state
        if (existing.state === 'executing' || existing.state === 'verifying') {
          return {
            success: true,
            executionId: existing.id,
            state: existing.state,
            message: 'Action execution in progress',
          };
        }
      }
    }

    // Load action/approval
    let approval = null;
    if (actionId.startsWith('appr_')) {
      approval = approvalStore.getRequest(actionId);
    } else {
      // Try to find by execution id
      const exec = executionStore.get(actionId);
      if (exec && exec.approval_request_id) {
        approval = approvalStore.getRequest(exec.approval_request_id);
      }
    }

    if (!approval) {
      throw new Error(`Action/approval not found: ${actionId}`);
    }

    // Verify organization ownership
    if (approval.organization_id !== context.organizationId) {
      throw new Error('Cross-tenant execution denied');
    }

    // Pilot-mode enforcement: financial mutations are blocked for pilot orgs
    const pilotError = validatePilotReadOnly(context.organizationId, 'FINANCIAL_TRANSACTION');
    if (pilotError) {
      throw new Error(
        'Read-only pilot mode: financial mutations and external writebacks are disabled. Use simulation mode for scenario analysis.'
      );
    }

    // Verify approval status
    if (approval.status !== 'approved') {
      throw new Error(`Action must be approved before execution (status: ${approval.status})`);
    }

    // Check for existing execution record
    let execution = executionStore.getByApprovalRequestId(approval.id);
    const execIdempotencyKey = idempotencyKey || approval.proposed_action?.idempotency_key || `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    if (!execution) {
      // Create execution record
      const payload = approval.modification || approval.proposed_action;
      const payloadHash = hashPayload(payload);
      
      // Capture before state
      const beforeState: Record<string, any> = {};
      if (payload.invoice_id) {
        const inv = udmStore.getInvoices().find(i => i.id === payload.invoice_id);
        if (inv) {
          beforeState.invoice = {
            id: inv.id,
            amount_minor_units: inv.amount_minor_units,
            status: inv.status,
            outstanding: getInvoiceOutstandingBalance(inv),
          };
        }
      }
      if (payload.payment_id) {
        const pay = udmStore.getPayments().find(p => p.id === payload.payment_id);
        if (pay) {
          beforeState.payment = {
            id: pay.id,
            amount_minor_units: pay.amount_minor_units,
          };
        }
      }
      
      execution = executionStore.create({
        id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        organization_id: approval.organization_id,
        requesting_user_id: null,
        approving_user_id: approval.reviewed_by_user_id || context.userId,
        action_type: approval.action_type as ActionType,
        target_entity_type: approval.subject_type,
        target_entity_ids: payload.invoice_id ? [payload.invoice_id] : (payload.payment_id ? [payload.payment_id] : []),
        action_payload: payload,
        action_payload_hash: payloadHash,
        idempotency_key: execIdempotencyKey,
        approval_request_id: approval.id,
        execution_attempt_id: `attempt_${Date.now()}`,
        state: 'draft',
        before_state_snapshot: beforeState,
        expected_outcome: {},
        commit_reference: null,
        executed_at: null,
        committed_at: null,
        verified_at: null,
        verification_result: null,
        failure_reason: null,
        failure_classification: null,
        recovery_attempts: 0,
      });
    } else {
      // If already in terminal verified state, return success regardless of
      // the idempotency key — the financial effect is already durable.
      if (execution.state === 'verified') {
        return {
          success: true,
          executionId: execution.id,
          state: execution.state,
          message: 'Action already verified',
        };
      }
      // Check if idempotency key conflicts (only relevant for non-terminal states)
      if (execution.idempotency_key !== execIdempotencyKey) {
        throw new Error('Idempotency key conflict with existing execution');
      }
      // Increment recovery attempts for any non-terminal re-execution (crash recovery).
      execution = executionStore.updateState(execution.id, execution.state, {
        recovery_attempts: (execution.recovery_attempts ?? 0) + 1,
      });
    }
    
    // Set tenant context
    udmStore.setTenantContext(context.organizationId);
    
    try {
      // Transition to approved
      execution = executionStore.updateState(execution.id, 'approved');
      
      // Transition to executing
      execution = executionStore.updateState(execution.id, 'executing');
      
      // Execute based on action type
      let commitRef: string | null = null;
      if (approval.action_type === 'RECORD_PAYMENT_MATCH' || approval.action_type === 'ALLOCATE_PAYMENT') {
        commitRef = await this.executePaymentAllocation(execution, approval, context);
      } else if (approval.action_type === 'ISSUE_CREDIT_NOTE') {
        commitRef = await this.executeCreditNote(execution, approval, context);
      } else {
        throw new Error(`Unsupported action type for execution: ${approval.action_type}`);
      }
      
      // Transition to committed
      execution = executionStore.updateState(execution.id, 'committed', {
        commit_reference: commitRef,
        committed_at: new Date().toISOString(),
        executed_at: execution.executed_at || new Date().toISOString(),
      });
      
      // Initiate verification
      execution = executionStore.updateState(execution.id, 'verifying');
      
      // Perform independent verification
      const verificationResult = await this.verifyExecution(execution);
      
      if (verificationResult.verified) {
        // Mark the approval execution result FIRST so the durable approval
        // state accurately reflects the outcome before we record the
        // execution as verified. If marking the verified state fails, the
        // execution remains in 'verifying' and is recoverable on restart.
        approvalStore.markExecutionResult(approval.id, 'succeeded');
        execution = executionStore.updateState(execution.id, 'verified', {
          verified_at: new Date().toISOString(),
          verification_result: verificationResult,
        });
        return {
          success: true,
          executionId: execution.id,
          state: 'verified',
          message: 'Action executed and verified successfully',
        };
      } else {
        approvalStore.markExecutionResult(approval.id, 'failed', verificationResult.reason);
        execution = executionStore.updateState(execution.id, 'verification_failed', {
          verification_result: verificationResult,
          failure_reason: verificationResult.reason,
          failure_classification: 'verification_failure',
        });
        return {
          success: false,
          executionId: execution.id,
          state: 'verification_failed',
          message: verificationResult.reason || 'Verification failed',
        };
      }
    } catch (error: any) {
      if (approval) {
        // Never overwrite an already-successful approval with a failure caused
        // only by a retry (e.g. duplicate match after the financial effect is
        // already durable). Reconcile execution to match the approval outcome.
        if (approval.execution_status === 'succeeded' && approval.executed_at !== null) {
          execution = executionStore.updateState(execution.id, 'verified', {
            verified_at: new Date().toISOString(),
            verification_result: { recovered: true, reason: error.message },
          });
          return {
            success: true,
            executionId: execution.id,
            state: 'verified',
            message: 'Action already executed (recovery reconciled outcome)',
          };
        }
        approvalStore.markExecutionResult(approval.id, 'failed', error.message);
      }
      execution = executionStore.updateState(execution.id, 'execution_failed', {
        failure_reason: error.message,
        failure_classification: 'execution_error',
      });
      return {
        success: false,
        executionId: execution.id,
        state: 'execution_failed',
        message: error.message,
      };
    }
  }

  private async executePaymentAllocation(execution: ExecutionRecord, approval: any, context: ExecutionContext): Promise<string> {
    const payload = approval.modification || approval.proposed_action;
    const orgId = context.organizationId;
    udmStore.setTenantContext(orgId);
    
    const invoiceId = payload.invoice_id || payload.matched_invoice_ids?.[0];
    const paymentId = payload.payment_id;
    const amount = payload.amount_minor_units || payload.matched_amount_minor_units;
    
    if (!invoiceId || !amount) {
      throw new Error('Missing invoice_id or amount for payment allocation');
    }
    
    const invoice = udmStore.getInvoices().find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.organization_id !== orgId) throw new Error('Invoice does not belong to organization');
    
    if (paymentId) {
      const payment = udmStore.getPayments().find(p => p.id === paymentId);
      if (!payment) throw new Error('Payment not found');
      if (payment.organization_id !== orgId) throw new Error('Payment does not belong to organization');
    }
    
    const currentOutstanding = getInvoiceOutstandingBalance(invoice);
    if (amount > currentOutstanding) {
      throw new Error(`Allocation ${amount} exceeds outstanding balance ${currentOutstanding}`);
    }
    
    // Idempotent recovery: if a match for this payment+invoice+amount already
    // exists (financial effect committed before a crash), return it instead of
    // creating a duplicate. This prevents a retry from double-debiting or from
    // failing on a duplicate-match error after the effect is already durable.
    const existingMatch = udmStore.getMatches().find(
      (m) => m.payment_id === paymentId && m.invoice_id === invoiceId && m.matched_amount_minor_units === amount && m.organization_id === orgId
    );
    if (existingMatch) {
      return existingMatch.id;
    }
    
    // Create match
    const match = udmStore.insertMatch({
      organization_id: orgId,
      payment_id: paymentId || `pay_alloc_${Date.now()}`,
      invoice_id: invoiceId,
      matched_amount_minor_units: amount,
      match_method: payload.match_method || 'manual',
      confidence: approval.confidence || 1.0,
    });
    
    // Update invoice status if fully paid
    const newOutstanding = getInvoiceOutstandingBalance(invoice);
    if (newOutstanding <= 0) {
      udmStore.updateInvoice(invoiceId, { status: 'paid' }, context.userId || undefined);
    } else {
      udmStore.updateInvoice(invoiceId, { status: 'partially_paid' }, context.userId || undefined);
    }
    
    return match.id;
  }

  private async executeCreditNote(execution: ExecutionRecord, approval: any, context: ExecutionContext): Promise<string> {
    const payload = approval.modification || approval.proposed_action;
    const orgId = context.organizationId;
    udmStore.setTenantContext(orgId);
    
    const cn = udmStore.insertCreditNote({
      organization_id: orgId,
      source_system: 'execution_service',
      source_id: `exec_${execution.id}`,
      customer_id: payload.customer_id,
      amount_minor_units: payload.amount_minor_units,
      currency: payload.currency || 'INR',
      date: payload.date || new Date().toISOString().split('T')[0],
      reason: payload.reason || 'Credit note issued via execution service',
    });
    
    return cn.id;
  }

  private async verifyExecution(execution: ExecutionRecord): Promise<{ verified: boolean; reason?: string; details?: any }> {
    const orgId = execution.organization_id;
    // Set tenant context for any store operations
    udmStore.setTenantContext(orgId);
    
    const payload = execution.action_payload;
    
    // Phase 4A: Use durable verification reading directly from SQLite
    const durableResult = durableVerifier.verifyFromDurableState(execution);
    if (!durableResult.verified) {
      return { verified: false, reason: durableResult.reason || 'Durable verification failed' };
    }
    
    // Additional in-memory verification for cross-check
    if (execution.action_type === 'RECORD_PAYMENT_MATCH' || execution.action_type === 'ALLOCATE_PAYMENT') {
      const invoiceId = payload.invoice_id || execution.target_entity_ids[0];
      const invoice = udmStore.getInvoices().find(i => i.id === invoiceId);
      
      if (!invoice) {
        return { verified: false, reason: 'Invoice not found in fresh read' };
      }
      if (invoice.organization_id !== orgId) {
        return { verified: false, reason: 'Invoice belongs to different organization' };
      }
      
      const matches = udmStore.getMatches().filter(m => 
        m.invoice_id === invoiceId && 
        m.organization_id === orgId
      );
      
      const totalMatched = matches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);
      const expectedAmount = payload.amount_minor_units || payload.matched_amount_minor_units;
      
      const hasMatchingAllocation = matches.some(m => m.matched_amount_minor_units === expectedAmount);
      if (!hasMatchingAllocation && totalMatched < expectedAmount) {
        return { verified: false, reason: `Expected allocation of ${expectedAmount} not found or insufficient` };
      }
      
      const outstanding = getInvoiceOutstandingBalance(invoice);
      const expectedOutstanding = Math.max(0, invoice.amount_minor_units - totalMatched);
      
      if (outstanding !== expectedOutstanding) {
        return { verified: false, reason: `Outstanding balance mismatch: got ${outstanding}, expected ${expectedOutstanding}` };
      }
      
      return {
        verified: true,
        details: {
          ...durableResult.details,
          invoiceId: invoice.id,
          totalMatched,
          outstanding,
          status: invoice.status,
        },
      };
    }
    
    if (execution.action_type === 'ISSUE_CREDIT_NOTE') {
      const creditNotes = udmStore.getCreditNotes().filter(cn => 
        cn.organization_id === orgId
      );
      const recentCN = creditNotes.find(cn => 
        cn.amount_minor_units === payload.amount_minor_units &&
        cn.customer_id === payload.customer_id
      );
      if (!recentCN) {
        return { verified: false, reason: 'Credit note not found in fresh read' };
      }
      // Enhanced verification for credit notes
      if (recentCN.organization_id !== orgId) {
        return { verified: false, reason: 'Credit note organization mismatch' };
      }
      if (recentCN.amount_minor_units !== payload.amount_minor_units) {
        return { verified: false, reason: 'Credit note amount mismatch' };
      }
      return { verified: true, details: { ...durableResult.details, creditNoteId: recentCN.id } };
    }
    
    return { verified: false, reason: `No verifier implemented for action type ${execution.action_type}` };
  }
}

export const executionService = new ExecutionService();
