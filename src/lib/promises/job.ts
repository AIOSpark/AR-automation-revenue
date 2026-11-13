// AIOSpark Scheduled Daily Promise Check Job (Layer 20)
// Automatically evaluates pending promises against payments and handles edge cases/grace periods.

import { udmStore } from '../udm/store';
import { pool } from '../db/postgres';
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
  /** Primary Daily Scheduled Job Entry Point */
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

      // Phase 1: Build claim keys and check existing claims against udm_idempotency_keys
      const invoiceClaimKeys = allMatches
        .filter((m) => m.invoice_id === promise.invoice_id)
        .map((m) => `${orgId}:payment_claim:${m.payment_id}`);

      const allClaimKeys = [...invoiceClaimKeys, ...custPayments.map((p) => `${orgId}:payment_claim:${p.id}`)];
      const claimCheckResults = await Promise.all(
        allClaimKeys.map((key) => 
          pool.query('SELECT 1 AS present FROM udm_idempotency_keys WHERE organization_id = $1 AND key = $2 LIMIT 1', [orgId, key])
        )
      );
      // Map each key to boolean: true if claim exists
      const claimedMap: Record<string, boolean> = {};
      claimCheckResults.forEach((result, i) => {
        claimedMap[allClaimKeys[i]] = result.rows.length > 0;
      })

      // Phase 2: Filter matches, skipping claimed keys
      let filteredInvMatches: any[] = [];
      if (promise.invoice_id) {
        filteredInvMatches = allMatches.filter((m) => m.invoice_id === promise.invoice_id);
        // Filter out claimed keys
        filteredInvMatches = filteredInvMatches.filter((m) => !claimedMap[`${orgId}:payment_claim:${m.payment_id}`]);
        totalReceivedForPromise = filteredInvMatches.reduce((sum, m) => sum + (m.matched_amount_minor_units ?? 0), 0);
        // Atomically reserve payment keys for filtered invoice matches
        const invoiceClaimPromises = filteredInvMatches.map((match) => {
          const claimKey = `${orgId}:payment_claim:${match.payment_id}`;
          return pool.query(
            'INSERT INTO udm_idempotency_keys(organization_id, key, record_id) VALUES ($1, $2, $3) ON CONFLICT (organization_id, key) DO NOTHING',
            [orgId, claimKey, `res_${Date.now()}`]
          );
        });
        await Promise.all(invoiceClaimPromises);
        if (totalReceivedForPromise > 0) matchedByInvoice = true;
      }

      // No invoice specified: filter customer payments, skipping claimed keys
      const availablePayments = custPayments.filter((payment) => {
        const key = `${orgId}:payment_claim:${payment.id}`;
        return !(claimedMap[key] === true);
      });
      if (availablePayments.length > 0) {
        const matchingPayment = availablePayments.find(
          (p) => Math.abs(p.amount_minor_units - promise.promised_amount_minor_units) <= promise.promised_amount_minor_units * 0.05
        );
        if (matchingPayment) {
          totalReceivedForPromise = matchingPayment.amount_minor_units;
          // Atomically reserve this payment key
          const claimKey = `${orgId}:payment_claim:${matchingPayment.id}`;
          await pool.query(
            'INSERT INTO udm_idempotency_keys(organization_id, key, record_id) VALUES ($1, $2, $3) ON CONFLICT (organization_id, key) DO NOTHING',
            [orgId, claimKey, `res_${Date.now()}`]
          );
          matchedByAmountOnly = true;
        } else {
          totalReceivedForPromise = availablePayments.reduce((sum, p) => sum + p.amount_minor_units, 0);
          // Atomically reserve payment keys for remaining customer payments
          const customerClaimPromises = availablePayments.map((payment) => {
            const claimKey = `${orgId}:payment_claim:${payment.id}`;
            return pool.query(
              'INSERT INTO udm_idempotency_keys(organization_id, key, record_id) VALUES ($1, $2, $3) ON CONFLICT (organization_id, key) DO NOTHING',
              [orgId, claimKey, `res_${Date.now()}`]
            );
          });
          await Promise.all(customerClaimPromises);
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
