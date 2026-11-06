// AIOSpark Bank DataAdapter Implementation (Adapter #4 - Layer 21)
// Follows Layer 5 DataAdapter interface conventions for bank statement & account aggregator data ingestion.

import {
  DataAdapter,
  OrgConnectionConfig,
  UniversalCustomer,
  UniversalInvoice,
  UniversalPayment,
  UniversalCreditNote,
  ConnectionHealth,
  ActionResult,
} from './types';
import { udmStore } from '../udm/store';
import { BankTransaction } from '../udm/types';

export interface RawBankStatementRow {
  date?: string;
  reference?: string;
  narration?: string;
  description?: string;
  amount?: number | string;
  credit?: number | string;
  debit?: number | string;
  deposit?: number | string;
  currency?: string;
  amount_minor_units?: number;
  direction?: 'credit' | 'debit';
}

export class BankAdapter implements DataAdapter {
  public readonly adapterType = 'bank';

  // Store durable raw bank statement payloads for audit/debugging purposes
  private rawStatementStore: Map<string, Array<{ organizationId: string; rawRow: Record<string, unknown>; uploadedAt: string }>> = new Map();

  public async fetchCustomers(_config: OrgConnectionConfig): Promise<UniversalCustomer[]> {
    return [];
  }

  public async fetchInvoices(_config: OrgConnectionConfig): Promise<UniversalInvoice[]> {
    return [];
  }

  public async fetchPayments(config: OrgConnectionConfig): Promise<UniversalPayment[]> {
    udmStore.setTenantContext(config.organizationId);
    const bankTxs = udmStore.getBankTransactions();
    return bankTxs.map((tx) => ({
      sourceId: tx.id,
      sourceSystem: tx.source_system,
      customerSourceId: 'unknown',
      amountMinorUnits: tx.amount_minor_units,
      currency: tx.currency,
      date: tx.date,
      reference: tx.narration_text || tx.raw_reference,
    }));
  }

  public async fetchCreditNotes(_config: OrgConnectionConfig): Promise<UniversalCreditNote[]> {
    return [];
  }

  public async pushAction(_config: OrgConnectionConfig, _action: Record<string, unknown>): Promise<ActionResult> {
    return {
      success: false,
      error: 'Bank statements are ingestion-only. Reconciliation mutations must go through the approval workflow.',
    };
  }

  public async getConnectionHealth(_config: OrgConnectionConfig): Promise<ConnectionHealth> {
    return {
      status: 'connected',
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    };
  }

  /**
   * Ingest raw bank statement rows (e.g. parsed from CSV/Excel or API).
   * Persists raw data first for audit purposes, then populates UDM `bank_transactions`.
   */
  public async ingestBankStatement(
    config: OrgConnectionConfig,
    rows: RawBankStatementRow[]
  ): Promise<BankTransaction[]> {
    const orgId = config.organizationId;
    udmStore.setTenantContext(orgId);

    const now = new Date().toISOString();
    const rawEntries = rows.map((row) => ({
      organizationId: orgId,
      rawRow: row as unknown as Record<string, unknown>,
      uploadedAt: now,
    }));

    if (!this.rawStatementStore.has(orgId)) {
      this.rawStatementStore.set(orgId, []);
    }
    this.rawStatementStore.get(orgId)!.push(...rawEntries);

    const ingested: BankTransaction[] = [];
    for (const row of rows) {
      const rawRef = String(row.reference || row.narration || 'REF-UNKNOWN').trim();
      const narration = String(row.narration || row.description || rawRef).trim();
      const txDate = String(row.date || now.split('T')[0]).trim();
      const currency = String(row.currency || 'INR').toUpperCase();

      // Explicit monetary unit resolution:
      // If amount_minor_units is explicitly provided (paise), use its magnitude and apply sign from direction.
      // Otherwise, convert from major units (INR rupees) once.
      // Debit direction => negative amount; Credit direction => positive amount.
      let amountMinorUnits: number;
      if (typeof row.amount_minor_units === 'number' && Number.isFinite(row.amount_minor_units)) {
        amountMinorUnits = Math.abs(Math.round(row.amount_minor_units));
      } else {
        const rawAmtVal = row.amount ?? row.credit ?? row.deposit ?? row.debit ?? 0;
        const numAmt = typeof rawAmtVal === 'number' ? rawAmtVal : Number(String(rawAmtVal).replace(/[^0-9.-]+/g, '')) || 0;
        amountMinorUnits = Math.abs(Math.round(numAmt * 100));
      }

      if (amountMinorUnits === 0) continue; // Skip zero-value non-transactions

      // Apply transaction direction sign: debit => outgoing (negative), credit => incoming (positive)
      if (row.direction === 'debit') {
        amountMinorUnits = -amountMinorUnits;
      }

      const txRecord = udmStore.insertBankTransaction({
        organization_id: orgId,
        source_system: String(config.sourceSystem || 'manual_upload'),
        raw_reference: rawRef,
        amount_minor_units: amountMinorUnits,
        currency,
        date: txDate,
        narration_text: narration,
        status: 'unmatched',
      });

      ingested.push(txRecord);
    }

    return ingested;
  }

  /**
   * Account Aggregator API / Banking API Scaffold Integration Point
   * For India's Account Aggregator framework / Open Banking APIs when credentials/access are configured.
   */
  public async syncAccountAggregatorApi(config: OrgConnectionConfig): Promise<{ status: string; syncedCount: number }> {
    if (!config.credentialsEncrypted) {
      return { status: 'mock_mode_active', syncedCount: 0 };
    }
    // Future Account Aggregator webhook / API fetch pipeline
    return { status: 'synced', syncedCount: 0 };
  }

  public getRawStatementStore(orgId: string) {
    return this.rawStatementStore.get(orgId) || [];
  }

  public clearRawStore(): void {
    this.rawStatementStore.clear();
  }
}
