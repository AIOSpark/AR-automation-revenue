// AIOSpark Payment Reconciliation Engine & Outcome Audit Tracker (Layer 21)
// Deterministic-then-fuzzy matching with mandatory Layer 18 Human Approval routing.

import { AuditService } from '../audit/service';
import { udmStore } from '../udm/store';
import { BankTransaction, Invoice, PaymentInvoiceMatch } from '../udm/types';
import { approvalStore, ApprovalRequest } from '../approvals/store';
import { policyEngine } from '../agents/policy-engine';
import { dashboardMetricsStore } from '../dashboard/engine';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export interface ProposedMatch {
  bankTransactionId: string;
  transactionReference: string;
  transactionNarration: string;
  transactionAmountMinorUnits: number;
  transactionDate: string;
  matchedInvoiceIds: string[];
  matchedInvoiceNumbers: string[];
  matchedAmountMinorUnits: number; // Sum of open balances matched
  matchMethod: 'deterministic' | 'fuzzy';
  confidence: number; // 0.0 - 1.0
  reasoning: string;
}

export interface MatchOutcomeRecord {
  id: string;
  organizationId: string;
  bankTransactionId: string;
  originalConfidence: number;
  originalMatchMethod: 'deterministic' | 'fuzzy';
  actionType: 'payment_reconciliation_match';
  outcome: 'approved' | 'rejected' | 'modified';
  finalInvoiceIds: string[];
  reviewedByUserId?: string | null;
  rejectionReason?: string | null;
  reviewedAt: string;
  created_at: string;
}

export class ReconciliationEngine {
  private outcomes: Map<string, MatchOutcomeRecord> = new Map();

  /**
   * Persists reconciliation outcomes to the durable snapshot store so that
   * match-outcome audit history survives application restarts.
   */
  private persist(): void {
    writeSnapshot<MatchOutcomeRecord[]>('reconciliation_outcomes', Array.from(this.outcomes.values()));
  }

  constructor() {
    const persisted = readSnapshot<MatchOutcomeRecord[]>('reconciliation_outcomes');
    if (persisted) {
      for (const record of persisted) {
        this.outcomes.set(record.id, record);
      }
    }
  }

  /**
   * Helper: Normalize string for fuzzy matching (lowercase, strip non-alphanumeric)
   */
  private normalize(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Run Deterministic Pass
   * Exact amount match AND transaction narration/reference contains customer name or invoice number.
   */
  public runDeterministicPass(
    tx: BankTransaction,
    openInvoices: Invoice[],
    orgId: string
  ): ProposedMatch | null {
    const textToSearch = (tx.narration_text + ' ' + tx.raw_reference).toLowerCase();
    const customers = udmStore.getCustomers();
    const customerMap = new Map(customers.map((c) => [c.id, c.name.toLowerCase()]));

    for (const inv of openInvoices) {
      // Calculate outstanding balance for this invoice
      const existingMatches = udmStore.getMatches().filter((m) => m.invoice_id === inv.id);
      const paidSum = existingMatches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);
      const openBal = Math.max(0, inv.amount_minor_units - paidSum);

      if (openBal === 0) continue;

      // Exact amount match check
        const invNumNorm = inv.number.toLowerCase();
        const custNameNorm = customerMap.get(inv.customer_id) || '';

        const containsInvNum = textToSearch.includes(invNumNorm) || textToSearch.includes(invNumNorm.replace(/[^a-z0-9]/g, ''));
        const containsCustName = custNameNorm.length > 2 && (textToSearch.includes(custNameNorm) || textToSearch.includes(custNameNorm.replace(/[^a-z0-9]/g, '')));

        const isExactAmountMatch = tx.amount_minor_units === openBal && (containsInvNum || containsCustName);
        const isPartialInvoiceMatch = tx.amount_minor_units <= openBal && containsInvNum;

        if (isExactAmountMatch || isPartialInvoiceMatch) {
          return {
            bankTransactionId: tx.id,
            transactionReference: tx.raw_reference,
            transactionNarration: tx.narration_text,
            transactionAmountMinorUnits: tx.amount_minor_units,
            transactionDate: tx.date,
            matchedInvoiceIds: [inv.id],
            matchedInvoiceNumbers: [inv.number],
            matchedAmountMinorUnits: tx.amount_minor_units,
            matchMethod: 'deterministic',
            confidence: 1.0,
            reasoning: isExactAmountMatch
              ? `Deterministic exact match: Amount (${tx.amount_minor_units / 100}) matched open balance for ${inv.number} with reference "${containsInvNum ? inv.number : custNameNorm}".`
              : `Deterministic partial payment match: Amount (${tx.amount_minor_units / 100}) matched open invoice ${inv.number} with explicit invoice reference.`,
          };
        }
    }
    return null;
  }

  /**
   * Run Fuzzy Pass (Fallback)
   * 1. Bank fee deduction (transaction amount is invoice balance minus plausible fee, e.g. up to 5% or 50,000 paise).
   * 2. Split payment (sum of multiple open invoices for same customer equals transaction amount).
   * 3. Garbled / partial reference matching.
   */
  public runFuzzyPass(
    tx: BankTransaction,
    openInvoices: Invoice[],
    orgId: string
  ): ProposedMatch | null {
    const textToSearch = (tx.narration_text + ' ' + tx.raw_reference).toLowerCase();
    const customers = udmStore.getCustomers();
    const customerMap = new Map(customers.map((c) => [c.id, c.name.toLowerCase()]));

    // Filter invoices with open balance > 0
    const eligibleInvoices = openInvoices.map((inv) => {
      const matches = udmStore.getMatches().filter((m) => m.invoice_id === inv.id);
      const paid = matches.reduce((s, m) => s + m.matched_amount_minor_units, 0);
      return { inv, openBal: inv.amount_minor_units - paid };
    }).filter((item) => item.openBal > 0);

    // Scenario 1: Exact Amount with partial reference match or fee deduction
    for (const item of eligibleInvoices) {
      const inv = item.inv;
      const openBal = item.openBal;
      const invNumNorm = inv.number.toLowerCase();
      const custNameNorm = customerMap.get(inv.customer_id) || '';

      // Fuzzy reference match score (tokens overlap)
      const invTokens = invNumNorm.split(/[^a-z0-9]+/);
      const custTokens = custNameNorm.split(/\s+/);
      const txNorm = this.normalize(textToSearch);

      const hasPartialRef = invTokens.some((t) => t.length > 2 && txNorm.includes(t)) ||
        custTokens.some((t) => t.length > 2 && txNorm.includes(t));

      // 1a. Fee deduction check: tx.amount is slightly less than invoice open balance (fee <= 5% and fee <= 50000 minor units)
      const diff = openBal - tx.amount_minor_units;
      if (diff > 0 && diff <= 50000 && diff <= openBal * 0.05) {
        let confidence = 0.85;
        if (!hasPartialRef) confidence -= 0.15;

        return {
          bankTransactionId: tx.id,
          transactionReference: tx.raw_reference,
          transactionNarration: tx.narration_text,
          transactionAmountMinorUnits: tx.amount_minor_units,
          transactionDate: tx.date,
          matchedInvoiceIds: [inv.id],
          matchedInvoiceNumbers: [inv.number],
          matchedAmountMinorUnits: tx.amount_minor_units,
          matchMethod: 'fuzzy',
          confidence: Math.round(confidence * 100) / 100,
          reasoning: `Fuzzy fee match: Transaction amount (${tx.amount_minor_units / 100}) accounts for expected bank fee deduction of ${diff / 100} against invoice ${inv.number} (open: ${openBal / 100}).`,
        };
      }

      // 1b. Garbled / Partial reference matching when amount equals open balance
      if (tx.amount_minor_units === openBal && hasPartialRef) {
        return {
          bankTransactionId: tx.id,
          transactionReference: tx.raw_reference,
          transactionNarration: tx.narration_text,
          transactionAmountMinorUnits: tx.amount_minor_units,
          transactionDate: tx.date,
          matchedInvoiceIds: [inv.id],
          matchedInvoiceNumbers: [inv.number],
          matchedAmountMinorUnits: tx.amount_minor_units,
          matchMethod: 'fuzzy',
          confidence: 0.88,
          reasoning: `Fuzzy reference match: Exact amount (${tx.amount_minor_units / 100}) matched with partial narration reference for invoice ${inv.number}.`,
        };
      }
    }

    // Scenario 2: Split payment detection across multiple invoices for the same customer
    const invoicesByCustomer = new Map<string, Array<{ inv: Invoice; openBal: number }>>();
    for (const item of eligibleInvoices) {
      const cid = item.inv.customer_id;
      if (!invoicesByCustomer.has(cid)) invoicesByCustomer.set(cid, []);
      invoicesByCustomer.get(cid)!.push(item);
    }

    for (const [cid, items] of invoicesByCustomer.entries()) {
      if (items.length < 2) continue;
      const custNameNorm = customerMap.get(cid) || '';
      const txNorm = this.normalize(textToSearch);
      const custMatch = custNameNorm.length > 2 && txNorm.includes(custNameNorm.replace(/[^a-z0-9]/g, ''));

      // Check all subset combinations of items
      const n = items.length;
      for (let i = 1; i < (1 << n); i++) {
        const subset: Array<{ inv: Invoice; openBal: number }> = [];
        for (let j = 0; j < n; j++) {
          if ((i & (1 << j)) !== 0) subset.push(items[j]);
        }
        if (subset.length < 2) continue;

        const sumSubset = subset.reduce((s, it) => s + it.openBal, 0);
        if (sumSubset === tx.amount_minor_units) {
          return {
            bankTransactionId: tx.id,
            transactionReference: tx.raw_reference,
            transactionNarration: tx.narration_text,
            transactionAmountMinorUnits: tx.amount_minor_units,
            transactionDate: tx.date,
            matchedInvoiceIds: subset.map((it) => it.inv.id),
            matchedInvoiceNumbers: subset.map((it) => it.inv.number),
            matchedAmountMinorUnits: tx.amount_minor_units,
            matchMethod: 'fuzzy',
            confidence: custMatch ? 0.90 : 0.78,
            reasoning: `Fuzzy split-payment match: Transaction sum (${tx.amount_minor_units / 100}) perfectly matches combined open balances of ${subset.length} invoices (${subset.map((it) => it.inv.number).join(', ')}) for customer ${custNameNorm || cid}.`,
          };
        }
      }
    }

    return null;
  }

  /**
   * Main Reconciliation Processing Routine
   * Processes unmatched transactions, generates proposals, and submits EVERY proposal
   * through PolicyEngine & Layer 18 Approval Center.
   */
  public async reconcileTransactions(
    orgId: string
  ): Promise<{ processedCount: number; proposedCount: number; pendingApprovalCount: number }> {
    udmStore.setTenantContext(orgId);
    const bankTxs = udmStore.getBankTransactions().filter((bt) => bt.status === 'unmatched' && bt.amount_minor_units > 0);
    const openInvoices = udmStore.getInvoices().filter((inv) => inv.status === 'open' || inv.status === 'partially_paid' || inv.status === 'disputed');

    let processedCount = 0;
    let proposedCount = 0;
    let pendingApprovalCount = 0;

    for (const tx of bankTxs) {
      processedCount++;

      let proposed = this.runDeterministicPass(tx, openInvoices, orgId);
      if (!proposed) {
        proposed = this.runFuzzyPass(tx, openInvoices, orgId);
      }

      if (proposed) {
        proposedCount++;

        // Update transaction status to pending_approval & attach proposal details
        udmStore.updateBankTransaction(tx.id, {
          status: 'pending_approval',
          matched_invoice_ids: proposed.matchedInvoiceIds,
          confidence: proposed.confidence,
          match_method: proposed.matchMethod,
        });

        // Submit proposal through PolicyEngine -> mandatory approval floor
        const policyRes = policyEngine.checkPolicy(orgId, 'reconciliation_engine', 'RECORD_PAYMENT_MATCH', {
          subjectType: 'payment',
          subjectId: tx.id,
          confidence: proposed.confidence,
          evidence: [
            { label: 'Match Method', value: proposed.matchMethod },
            { label: 'Confidence Score', value: `${(proposed.confidence * 100).toFixed(0)}%` },
            { label: 'Reasoning', value: proposed.reasoning },
            { label: 'Transaction Reference', value: proposed.transactionReference },
            { label: 'Transaction Narration', value: proposed.transactionNarration },
            { label: 'Transaction Amount', value: `₹${(proposed.transactionAmountMinorUnits / 100).toLocaleString('en-IN')}` },
            { label: 'Target Invoices', value: proposed.matchedInvoiceNumbers.join(', ') },
          ],
          payload: {
            bank_transaction_id: tx.id,
            action: 'payment_reconciliation_match',
            match_method: proposed.matchMethod,
            confidence: proposed.confidence,
            matched_invoice_ids: proposed.matchedInvoiceIds,
            matched_invoice_numbers: proposed.matchedInvoiceNumbers,
            transaction_amount_minor_units: proposed.transactionAmountMinorUnits,
            reasoning: proposed.reasoning,
          },
        });

        if (policyRes.requiresApproval) {
          pendingApprovalCount++;
        }
      }
    }

    return { processedCount, proposedCount, pendingApprovalCount };
  }

  /**
   * Execute Approval Outcome for a Payment Reconciliation Approval Request
   * Invoked upon approval or modification/approval in Layer 18.
   */
  public async executeApprovedMatch(
    approvalRequestId: string,
    reviewedUserId: string,
    overridePayload?: Record<string, any>
  ): Promise<{ success: boolean; matchIds: string[]; paymentId: string }> {
    const appReq = approvalStore.getRequest(approvalRequestId);
    if (!appReq) throw new Error(`Approval request not found: ${approvalRequestId}`);
    if (appReq.status !== 'approved') {
      throw new Error(`Approval request ${approvalRequestId} must be approved before reconciliation execution`);
    }

    const payload = overridePayload || appReq.modification || appReq.proposed_action;
    const orgId = appReq.organization_id;
    udmStore.setTenantContext(orgId);

    const txId = payload.bank_transaction_id;
    const tx = udmStore.getBankTransactions().find((t) => t.id === txId);
    if (!tx) throw new Error(`Bank transaction not found for match execution: ${txId}`);
    if (tx.status === 'matched') {
      throw new Error(`Bank transaction ${txId} has already been reconciled`);
    }

    const invoiceIds: string[] = payload.matched_invoice_ids || [];
    if (invoiceIds.length === 0) throw new Error('No target invoices specified for reconciliation match execution');
    if (!Number.isSafeInteger(tx.amount_minor_units) || tx.amount_minor_units <= 0) {
      throw new Error('Bank transaction amount must be a positive integer before reconciliation');
    }
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new Error('A reconciliation match cannot contain duplicate invoice targets');
    }

    const targetInvoices = invoiceIds.map((invoiceId) => udmStore.getInvoices().find((invoice) => invoice.id === invoiceId));
    if (targetInvoices.some((invoice) => !invoice)) {
      throw new Error('One or more target invoices no longer exist in the active organization');
    }
    const resolvedInvoices = targetInvoices as NonNullable<typeof targetInvoices[number]>[];
    const customerIds = new Set(resolvedInvoices.map((invoice) => invoice.customer_id));
    if (customerIds.size !== 1) {
      throw new Error('A reconciliation match cannot combine invoices from different customers');
    }

    const availableBalance = resolvedInvoices.reduce((total, invoice) => {
      const paidSum = udmStore.getMatches()
        .filter((match) => match.invoice_id === invoice.id)
        .reduce((sum, match) => sum + match.matched_amount_minor_units, 0);
      return total + Math.max(0, invoice.amount_minor_units - paidSum);
    }, 0);
    if (availableBalance < tx.amount_minor_units) {
      throw new Error('Selected invoices cannot absorb the full bank transaction amount');
    }

    // 1. Create real UDM Payment record
    const payment = udmStore.insertPayment({
      organization_id: orgId,
      source_system: tx.source_system,
      source_id: tx.id,
      customer_id: resolvedInvoices[0].customer_id,
      amount_minor_units: tx.amount_minor_units,
      currency: tx.currency,
      date: tx.date,
      reference: tx.narration_text || tx.raw_reference,
    });

    // 2. Create PaymentInvoiceMatch record(s) and update invoice status/balances
    const createdMatchIds: string[] = [];
    let remainingTxAmount = tx.amount_minor_units;

    for (const invId of invoiceIds) {
      const inv = resolvedInvoices.find((invoice) => invoice.id === invId);
      if (!inv) throw new Error(`Target invoice not found for reconciliation match execution: ${invId}`);

      const existingMatches = udmStore.getMatches().filter((m) => m.invoice_id === invId);
      const paidSum = existingMatches.reduce((s, m) => s + m.matched_amount_minor_units, 0);
      const openBal = Math.max(0, inv.amount_minor_units - paidSum);

      const matchAmount = Math.min(remainingTxAmount, openBal > 0 ? openBal : remainingTxAmount);
      if (matchAmount <= 0) continue;

      const matchRecord: PaymentInvoiceMatch = udmStore.insertMatch({
        organization_id: orgId,
        payment_id: payment.id,
        invoice_id: invId,
        matched_amount_minor_units: matchAmount,
        confidence: appReq.confidence,
        match_method: payload.match_method || 'deterministic',
      });
      createdMatchIds.push(matchRecord.id);
      remainingTxAmount -= matchAmount;

      // Update invoice status based on total paid
      const newPaidTotal = paidSum + matchAmount;
      udmStore.updateInvoice(
        invId,
        { status: newPaidTotal >= inv.amount_minor_units ? 'paid' : 'partially_paid' },
        reviewedUserId
      );
    }

    if (remainingTxAmount !== 0) {
      throw new Error('Reconciliation allocation did not fully consume the bank transaction amount');
    }

    // 3. Mark bank_transactions row as matched
    udmStore.updateBankTransaction(tx.id, {
      status: 'matched',
      matched_payment_id: payment.id,
      matched_invoice_ids: invoiceIds,
    });

    // 4. Record outcome audit record for historical accuracy dataset
    const isModified = Boolean(overridePayload || appReq.modification);
    const outcomeRecord: MatchOutcomeRecord = {
      id: `outc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      organizationId: orgId,
      bankTransactionId: tx.id,
      originalConfidence: appReq.confidence,
      originalMatchMethod: payload.match_method || 'deterministic',
      actionType: 'payment_reconciliation_match',
      outcome: isModified ? 'modified' : 'approved',
      finalInvoiceIds: invoiceIds,
      reviewedByUserId: reviewedUserId,
      reviewedAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    this.outcomes.set(outcomeRecord.id, outcomeRecord);
    this.persist();

    // Wire into Layer 26 Audit Log
    for (const invId of invoiceIds) {
      AuditService.record({
        organization_id: orgId,
        actor_user_id: reviewedUserId,
        actor_type: 'user',
        action_type: 'reconciliation.matched',
        subject_type: 'invoice',
        subject_id: invId,
        after_state: { bank_transaction_id: tx.id, payment_id: payment.id, matched_invoices: invoiceIds },
        approval_context: { approval_request_id: approvalRequestId, status: 'approved', reviewer_id: reviewedUserId },
        result: 'success',
      });
    }

    // 5. Trigger Layer 9 Dashboard Cache recompute
    dashboardMetricsStore.refreshMetrics(orgId);

    return {
      success: true,
      matchIds: createdMatchIds,
      paymentId: payment.id,
    };
  }

  /**
   * Execute Rejection Outcome for a Payment Reconciliation Approval Request
   */
  public async executeRejectedMatch(
    approvalRequestId: string,
    reviewedUserId: string,
    reason?: string
  ): Promise<{ success: boolean }> {
    const appReq = approvalStore.getRequest(approvalRequestId);
    if (!appReq) throw new Error(`Approval request not found: ${approvalRequestId}`);
    if (appReq.status !== 'rejected') {
      throw new Error(`Approval request ${approvalRequestId} must be rejected before rejection execution`);
    }

    const payload = appReq.proposed_action;
    const orgId = appReq.organization_id;
    udmStore.setTenantContext(orgId);

    const txId = payload.bank_transaction_id;
    if (txId) {
      udmStore.updateBankTransaction(txId, {
        status: 'unmatched',
        rejection_reason: reason || 'Rejected by approver',
      });
    }

    const outcomeRecord: MatchOutcomeRecord = {
      id: `outc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      organizationId: orgId,
      bankTransactionId: txId,
      originalConfidence: appReq.confidence,
      originalMatchMethod: payload.match_method || 'deterministic',
      actionType: 'payment_reconciliation_match',
      outcome: 'rejected',
      finalInvoiceIds: [],
      reviewedByUserId: reviewedUserId,
      rejectionReason: reason || null,
      reviewedAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    this.outcomes.set(outcomeRecord.id, outcomeRecord);
    this.persist();

    return { success: true };
  }

  public getOutcomes(orgId: string): MatchOutcomeRecord[] {
    return Array.from(this.outcomes.values()).filter((o) => o.organizationId === orgId);
  }

  public clearAll(): void {
    this.outcomes.clear();
    deleteSnapshot('reconciliation_outcomes');
  }
}

export const reconciliationEngine = new ReconciliationEngine();
