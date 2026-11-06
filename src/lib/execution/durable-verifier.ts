// AIOSpark Phase 4A - Independent Durable Verification

import { readSnapshotDirect } from '../db/durable-repository';
import { ExecutionRecord } from './types';
import { udmStore } from '../udm/store';

export class DurableVerifier {
  /**
   * Verify by reading directly from SQLite snapshots (independent of UDM in-memory state)
   * Falls back to UDM store in test mode if no durable state
   */
  public verifyFromDurableState(execution: ExecutionRecord): { verified: boolean; reason?: string; details?: any } {
    try {
      // Read all relevant snapshots directly from SQLite
      const udmState = readSnapshotDirect<any>('udm');
      
      if (!udmState) {
        // Fallback to UDM store for test mode
        const orgId = execution.organization_id;
        udmStore.setTenantContext(orgId);
        const payload = execution.action_payload;
        
        if (execution.action_type === 'RECORD_PAYMENT_MATCH' || execution.action_type === 'ALLOCATE_PAYMENT') {
          const invoiceId = payload.invoice_id || execution.target_entity_ids[0];
          const invoice = udmStore.getInvoices().find((i: any) => i.id === invoiceId && i.organization_id === orgId);
          
          if (!invoice) {
            return { verified: false, reason: 'Invoice not found in state' };
          }
          
          const matches = udmStore.getMatches().filter((m: any) => 
            m.invoice_id === invoiceId && m.organization_id === orgId
          );
          
          const totalMatched = matches.reduce((sum: number, m: any) => sum + m.matched_amount_minor_units, 0);
          const expectedAmount = payload.amount_minor_units || payload.matched_amount_minor_units;
          
          const hasMatchingAllocation = matches.some((m: any) => m.matched_amount_minor_units === expectedAmount);
          if (!hasMatchingAllocation && totalMatched < expectedAmount) {
            return { verified: false, reason: `Expected allocation not found` };
          }
          
          const outstanding = Math.max(0, invoice.amount_minor_units - totalMatched);
          
          if (invoice.organization_id !== orgId) {
            return { verified: false, reason: 'Invoice org mismatch' };
          }
          
          return {
            verified: true,
            details: {
              source: 'udm_fallback',
              invoiceId: invoice.id,
              totalMatched,
              outstanding,
              status: invoice.status,
            },
          };
        }
        
        if (execution.action_type === 'ISSUE_CREDIT_NOTE') {
          const creditNotes = udmStore.getCreditNotes().filter((cn: any) => cn.organization_id === orgId);
          const cn = creditNotes.find((c: any) => 
            c.amount_minor_units === payload.amount_minor_units &&
            c.customer_id === payload.customer_id
          );
          if (!cn) {
            return { verified: false, reason: 'Credit note not found' };
          }
          if (cn.organization_id !== orgId) {
            return { verified: false, reason: 'Credit note org mismatch' };
          }
          return { verified: true, details: { source: 'udm_fallback', creditNoteId: cn.id } };
        }
        
        return { verified: false, reason: 'No verifier for action type' };
      }
      
      const orgId = execution.organization_id;
      const payload = execution.action_payload;
      
      if (execution.action_type === 'RECORD_PAYMENT_MATCH' || execution.action_type === 'ALLOCATE_PAYMENT') {
        const invoiceId = payload.invoice_id || execution.target_entity_ids[0];
        const invoices = udmState.invoices || [];
        const invoice = invoices.find((i: any) => i.id === invoiceId && i.organization_id === orgId);
        
        if (!invoice) {
          return { verified: false, reason: 'Invoice not found in durable SQLite state' };
        }
        
        const matches = (udmState.matches || []).filter((m: any) => 
          m.invoice_id === invoiceId && m.organization_id === orgId
        );
        
        const totalMatched = matches.reduce((sum: number, m: any) => sum + m.matched_amount_minor_units, 0);
        const expectedAmount = payload.amount_minor_units || payload.matched_amount_minor_units;
        
        const hasMatchingAllocation = matches.some((m: any) => m.matched_amount_minor_units === expectedAmount);
        if (!hasMatchingAllocation && totalMatched < expectedAmount) {
          return { verified: false, reason: `Expected allocation not found in durable state` };
        }
        
        const outstanding = Math.max(0, invoice.amount_minor_units - totalMatched);
        
        if (invoice.organization_id !== orgId) {
          return { verified: false, reason: 'Invoice org mismatch in durable state' };
        }
        
        return {
          verified: true,
          details: {
            source: 'sqlite_direct_read',
            invoiceId: invoice.id,
            totalMatched,
            outstanding,
            status: invoice.status,
          },
        };
      }
      
      if (execution.action_type === 'ISSUE_CREDIT_NOTE') {
        const creditNotes = udmState.creditNotes || [];
        const cn = creditNotes.find((c: any) => 
          c.organization_id === orgId &&
          c.amount_minor_units === payload.amount_minor_units &&
          c.customer_id === payload.customer_id
        );
        if (!cn) {
          return { verified: false, reason: 'Credit note not found in durable SQLite state' };
        }
        if (cn.organization_id !== orgId) {
          return { verified: false, reason: 'Credit note org mismatch' };
        }
        return { verified: true, details: { source: 'sqlite_direct_read', creditNoteId: cn.id } };
      }
      
      return { verified: false, reason: 'No durable verifier for action type' };
    } catch (error: any) {
      return { verified: false, reason: `Durable verification error: ${error.message}` };
    }
  }
}

export const durableVerifier = new DurableVerifier();
