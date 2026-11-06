// AIOSpark Scheduled Daily Promise Check Job (Layer 20)
// Automatically evaluates pending promises against payments and handles edge cases/grace periods.

import { udmStore } from '../udm/store';
import { promiseStore, PaymentPromise } from './store';
import { runCollectionsAgent } from '../agents/collections-agent';

export interface PromiseCheckJobResult {
  evaluatedCount: number;
  keptCount: number;
  brokenCount: number;
  partialCount: number;
  retroactiveKeptCount: number;
  triggeredCollectionsCount: number;
}

export class PromiseCheckJob {
  /**
   * Primary Daily Scheduled Job Entry Point
   */
  public static async runDailyCheck(
    orgId: string,
    todayStr?: string
  ): Promise<PromiseCheckJobResult> {
    udmStore.setTenantContext(orgId);
    const today = todayStr || new Date().toISOString().split('T')[0];
    const todayMs = new Date(today).getTime();
    const graceDays = promiseStore.getGracePeriodDays();
    const graceMs = graceDays * 24 * 60 * 60 * 1000;

    const allPromises = promiseStore.getPromises(orgId);
    const allPayments = udmStore.getPayments();
    const allMatches = udmStore.getMatches();
    const claimedPaymentIds = new Set<string>();

    let evaluatedCount = 0;
    let keptCount = 0;
    let brokenCount = 0;
    let partialCount = 0;
    let retroactiveKeptCount = 0;
    let triggeredCollectionsCount = 0;

    for (const promise of allPromises) {
      const expDateMs = new Date(promise.expected_date).getTime();
      const deadlineMs = expDateMs + graceMs;

      // Filter customer payments created at or after promise creation
      const promiseCreatedMs = new Date(promise.created_at).getTime();
      const custPayments = allPayments.filter(
        (p) => p.customer_id === promise.customer_id && new Date(p.created_at).getTime() >= promiseCreatedMs
      );

      // Determine payment sum matched to promise
      let totalReceivedForPromise = 0;
      let matchedByInvoice = false;
      let matchedByAmountOnly = false;

      if (promise.invoice_id) {
        // Invoice specified: sum matches against this specific invoice
        const invMatches = allMatches.filter((m) => {
          if (m.invoice_id !== promise.invoice_id || claimedPaymentIds.has(m.payment_id)) return false;
          const payment = allPayments.find((candidate) => candidate.id === m.payment_id);
          return Boolean(payment && new Date(payment.created_at).getTime() >= promiseCreatedMs);
        });
        totalReceivedForPromise = invMatches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);
        invMatches.forEach((match) => claimedPaymentIds.add(match.payment_id));
        if (totalReceivedForPromise > 0) matchedByInvoice = true;
      } else {
        // No invoice specified: check customer payments around amount
        const availablePayments = custPayments.filter((payment) => !claimedPaymentIds.has(payment.id));
        if (availablePayments.length > 0) {
          const matchingPayment = availablePayments.find(
            (p) => Math.abs(p.amount_minor_units - promise.promised_amount_minor_units) <= promise.promised_amount_minor_units * 0.05
          );
          if (matchingPayment) {
            totalReceivedForPromise = matchingPayment.amount_minor_units;
            claimedPaymentIds.add(matchingPayment.id);
            matchedByAmountOnly = true;
          } else {
            totalReceivedForPromise = availablePayments.reduce((sum, p) => sum + p.amount_minor_units, 0);
            availablePayments.forEach((payment) => claimedPaymentIds.add(payment.id));
          }
        }
      }

      const matchNote = matchedByAmountOnly
        ? 'Matched by payment amount / customer activity, not by explicit invoice reference'
        : matchedByInvoice
        ? 'Matched by explicit invoice reference'
        : undefined;

      // 1. Pending Evaluation
      if (promise.status === 'pending') {
        evaluatedCount++;

        if (totalReceivedForPromise >= promise.promised_amount_minor_units) {
          promiseStore.updatePromiseStatus(promise.id, 'kept', matchNote);
          keptCount++;
        } else if (todayMs > deadlineMs) {
          // Deadline + grace period has passed
          if (totalReceivedForPromise > 0) {
            // Partial payment rule: any payment > 0 but < promised amount
            promiseStore.updatePromiseStatus(promise.id, 'partial', matchNote || 'Partial payment received before deadline');
            partialCount++;
          } else {
            // Nothing received -> Broken promise
            promiseStore.updatePromiseStatus(promise.id, 'broken', matchNote || 'No payment received past deadline & grace period');
            brokenCount++;

            // TRIGGER COLLECTIONS AGENT FOLLOW-UP IMMEDIATELY
            if (promise.invoice_id) {
              try {
                const agentRes = await runCollectionsAgent({
                  organizationId: orgId,
                  invoiceId: promise.invoice_id,
                  contentType: 'payment_reminder',
                });
                if (agentRes.success) triggeredCollectionsCount++;
              } catch (err) {
                console.log(`[PROMISE CHECK] Note: Collections agent trigger note: ${err}`);
              }
            }
          }
        }
      } else if (promise.status === 'broken') {
        // EDGE CASE: RETROACTIVE UPDATE FOR LATE PAYMENT
        // Allow a broken promise to retroactively become 'kept' if full payment arrives later
        if (totalReceivedForPromise >= promise.promised_amount_minor_units) {
          promiseStore.updatePromiseStatus(promise.id, 'kept', 'Retroactive update: Full matching payment arrived late after broken deadline');
          retroactiveKeptCount++;
        }
      }
    }

    return {
      evaluatedCount,
      keptCount,
      brokenCount,
      partialCount,
      retroactiveKeptCount,
      triggeredCollectionsCount,
    };
  }
}
