// AIOSpark CSV/Excel DataAdapter Implementation (Adapter #1)

import {
  DataAdapter,
  OrgConnectionConfig,
  UniversalCustomer,
  UniversalInvoice,
  UniversalPayment,
  UniversalCreditNote,
  ConnectionHealth,
  ActionResult,
} from "./types";
import { onboardingStore } from "../onboarding/store";

export class CSVAdapter implements DataAdapter {
  public readonly adapterType = "csv";

  public async fetchCustomers(config: OrgConnectionConfig): Promise<UniversalCustomer[]> {
    const invoices = await this.fetchInvoices(config);
    const customerMap = new Map<string, UniversalCustomer>();

    for (const inv of invoices) {
      if (!customerMap.has(inv.customerSourceId)) {
        customerMap.set(inv.customerSourceId, {
          sourceId: inv.customerSourceId,
          sourceSystem: "csv",
          name: inv.customerSourceId.replace("cust_csv_", "").replace(/_/g, " "),
          contacts: [{ name: "AP Manager", email: `ap@${inv.customerSourceId}.com` }],
          creditTermsDays: 30,
        });
      }
    }

    return Array.from(customerMap.values());
  }

  public async fetchInvoices(config: OrgConnectionConfig): Promise<UniversalInvoice[]> {
    let rows: Record<string, unknown>[] = config.rowsData || [];
    let mapping = config.columnMapping || onboardingStore.getOrgColumnMapping(config.organizationId) || {};

    if (rows.length === 0 && config.rawFileBuffer) {
      const parsed = onboardingStore.parseFileBuffer(config.rawFileBuffer);
      rows = parsed.rows;
      if (Object.keys(mapping).length === 0) {
        mapping = onboardingStore.autoSuggestMapping(parsed.headers);
      }
    }

    const invoices: UniversalInvoice[] = [];

    rows.forEach((row, index) => {
      const customerName = String(row[mapping.customer_name] || "Unknown Buyer").trim();
      const invoiceNumber = String(row[mapping.invoice_number] || `INV-CSV-${index + 1}`).trim();
      const rawAmount = row[mapping.amount];
      const issueDate = String(row[mapping.issue_date] || new Date().toISOString().split("T")[0]).trim();
      const status = String(row[mapping.status] || "Payment Blocked").trim() as UniversalInvoice["status"];
      const poNumber = String(row[mapping.po_number] || "").trim();

      const numAmount = Number(String(rawAmount).replace(/[^0-9.-]+/g, "")) || 100000;
      const amountMinorUnits = Math.round(numAmount * 100); // Integer minor units (e.g. paise/cents)

      const customerSourceId = `cust_csv_${customerName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      const sourceId = `inv_csv_${config.organizationId}_${invoiceNumber}`;

      invoices.push({
        sourceId,
        sourceSystem: "csv",
        customerSourceId,
        number: invoiceNumber,
        amountMinorUnits,
        currency: (config.currency as string) || "INR",
        taxAmountMinorUnits: Math.round(amountMinorUnits * 0.18),
        issueDate,
        dueDate: new Date(new Date(issueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status,
        poNumber: poNumber || undefined,
      });
    });

    return invoices;
  }

  public async fetchPayments(config: OrgConnectionConfig): Promise<UniversalPayment[]> {
    const invoices = await this.fetchInvoices(config);
    return invoices
      .filter((inv) => inv.status === "Cleared")
      .map((inv) => ({
        sourceId: `pay_${inv.sourceId}`,
        sourceSystem: "csv",
        customerSourceId: inv.customerSourceId,
        amountMinorUnits: inv.amountMinorUnits,
        currency: inv.currency,
        date: inv.issueDate,
        reference: `RECON-${inv.number}`,
      }));
  }

  public async fetchCreditNotes(config: OrgConnectionConfig): Promise<UniversalCreditNote[]> {
    const invoices = await this.fetchInvoices(config);
    return invoices
      .filter((inv) => inv.status === "Action Required")
      .slice(0, 1)
      .map((inv) => ({
        sourceId: `cn_${inv.sourceId}`,
        sourceSystem: "csv",
        customerSourceId: inv.customerSourceId,
        amountMinorUnits: Math.round(inv.amountMinorUnits * 0.1),
        currency: inv.currency,
        date: inv.issueDate,
        reason: "PO Quantity Line Discrepancy Adjustment",
      }));
  }

  public async pushAction(
    _config: OrgConnectionConfig,
    _action: Record<string, unknown>
  ): Promise<ActionResult> {
    return {
      success: false,
      error: "CSV/Excel is an ingestion-only source. Export the corrected ledger and re-import it after approval.",
    };
  }

  public async getConnectionHealth(config: OrgConnectionConfig): Promise<ConnectionHealth> {
    const mapping = onboardingStore.getOrgColumnMapping(config.organizationId);
    return {
      status: mapping ? "connected" : "disconnected",
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    };
  }
}
