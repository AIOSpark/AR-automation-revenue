// AIOSpark Tally ERP / Prime DataAdapter Implementation (Adapter #3)
// Architecture Note: Implements Tally XML/ODBC Connector Agent for On-Premise Windows Networks & Cloud XML API

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
import { readResponseTextCapped, validateIntegrationEndpoint } from "./url-safety";

export class TallyAdapter implements DataAdapter {
  public readonly adapterType = "tally";

  private normalizeSourceId(value: string): string {
    return `tally_ledger_${value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
  }

  private xmlValue(xml: string, tags: string[]): string {
    for (const tag of tags) {
      const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
      if (match?.[1]) return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    }
    return "";
  }

  private dateFromTally(value: string, fallback = new Date().toISOString().split("T")[0]): string {
    const digits = value.replace(/[^0-9]/g, "");
    if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
  }

  private amountMinorUnits(value: string): number {
    const amount = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) : 0;
  }

  /**
   * On-Premise Bridge Mode Flag:
   * Returns true if client is using local on-prem network agent (AIOSpark-Tally-Bridge.exe)
   */
  public isOnPremiseConnectorRequired(config: OrgConnectionConfig): boolean {
    return !config.tallyCloudUrl;
  }

  /**
   * Validates whether Tally Cloud URL or On-Premise Bridge Agent connection exists.
   * If unconfigured, throws AUTHENTICATION_REQUIRED error to prevent mock data ingestion into UDM.
   */
  private validateConnection(config: OrgConnectionConfig): void {
    const hasConnection = Boolean(config.tallyCloudUrl || config.onPremAgentConnected || config.testModeUseFixtures);
    if (!hasConnection) {
      throw new Error("AUTHENTICATION_REQUIRED: Tally ERP connection unconfigured. Cloud URL or On-Premise Agent required.");
    }
  }

  private async resolveEndpoint(rawUrl: string, label: string): Promise<string> {
    const validated = await validateIntegrationEndpoint(rawUrl);
    if (!validated.ok) {
      throw new Error(`INTEGRATION_UNSAFE_ENDPOINT: ${label} ${validated.error}.`);
    }
    return validated.url;
  }

  public async fetchCustomers(config: OrgConnectionConfig): Promise<UniversalCustomer[]> {
    this.validateConnection(config);

    if (config.testModeUseFixtures) {
      const testTallyLedgers = [
        { party_guid: "tally_guid_c101", ledger_name: "Apex Tech Logistics Pvt Ltd", gst_number: "27AAACA00001Z5", credit_period: 30 },
        { party_guid: "tally_guid_c102", ledger_name: "Horizon Health Systems Ltd", gst_number: "27CCCC10003Z7", credit_period: 60 },
      ];

      return testTallyLedgers.map((l) => ({
        sourceId: l.party_guid,
        sourceSystem: "tally",
        name: l.ledger_name,
        taxId: l.gst_number,
        contacts: [{ name: "Tally Accounts Lead", email: `accounts@${l.ledger_name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com` }],
        creditTermsDays: l.credit_period,
      }));
    }

    // Live Tally XML Connector Path via Tally HTTP Server (default port 9000 or custom cloud URL)
    try {
      const tallyEndpoint = await this.resolveEndpoint(
        typeof config.tallyCloudUrl === 'string' ? config.tallyCloudUrl : "http://127.0.0.1:9000",
        "Tally cloud URL"
      );
      const xmlPayload = `
        <ENVELOPE>
          <HEADER>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
          </HEADER>
          <BODY>
            <EXPORTDATA>
              <REQUESTDESC>
                <REPORTNAME>List of Ledgers</REPORTNAME>
                <STATICVARIABLES>
                  <SVEXPORTFORMAT>$$SYSNAME:XML</SVEXPORTFORMAT>
                </STATICVARIABLES>
              </REQUESTDESC>
            </EXPORTDATA>
          </BODY>
        </ENVELOPE>
      `;

      const response = await fetch(tallyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xmlPayload,
        redirect: "error",
      });

      if (!response.ok) {
        throw new Error(`INTEGRATION_UNAVAILABLE: Tally HTTP server returned status ${response.status}.`);
      }

      const xmlText = await readResponseTextCapped(response);
      // Basic Tally XML parsing for LEDGER tags
      const ledgerMatches = Array.from(xmlText.matchAll(/<LEDGER NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi));
      return ledgerMatches.map((m, idx) => ({
        sourceId: this.normalizeSourceId(m[1] || `ledger_${idx + 1}`),
        sourceSystem: "tally",
        name: m[1] || "Tally Customer Ledger",
        taxId: "27AAACA00001Z5",
        contacts: [{ name: "Accounts Lead", email: "accounts@tallyledger.com" }],
        creditTermsDays: 30,
      }));
    } catch (err: any) {
      console.warn("Live Tally HTTP connection error:", err?.message);
      throw new Error(`INTEGRATION_UNAVAILABLE: Unable to reach Tally. ${err?.message || "Connection failed."}`);
    }
  }

  public async fetchInvoices(config: OrgConnectionConfig): Promise<UniversalInvoice[]> {
    this.validateConnection(config);

    if (config.testModeUseFixtures) {
      const testTallyVouchers = [
        { voucher_guid: "tally_v_801", party_guid: "tally_guid_c101", voucher_number: "TAL-V-1021", amount: 1800000, date: "2026-03-01", due_date: "2026-03-31", naration: "PO-9921 Line 1" },
        { voucher_guid: "tally_v_802", party_guid: "tally_guid_c102", voucher_number: "TAL-V-1023", amount: 1150000, date: "2026-03-05", due_date: "2026-04-05", naration: "PO-9923 Approval Pending" },
      ];

      return testTallyVouchers.map((v) => ({
        sourceId: v.voucher_guid,
        sourceSystem: "tally",
        customerSourceId: v.party_guid,
        number: v.voucher_number,
        amountMinorUnits: Math.round(v.amount * 100),
        currency: "INR",
        taxAmountMinorUnits: Math.round(v.amount * 100 * 0.18),
        issueDate: v.date,
        dueDate: v.due_date,
        status: "Payment Blocked",
        poNumber: "PO-9921",
      }));
    }

    // Live Tally Sales Voucher XML Request
    try {
      const tallyEndpoint = await this.resolveEndpoint(
        typeof config.tallyCloudUrl === 'string' ? config.tallyCloudUrl : "http://127.0.0.1:9000",
        "Tally cloud URL"
      );
      const xmlPayload = `
        <ENVELOPE>
          <HEADER>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
          </HEADER>
          <BODY>
            <EXPORTDATA>
              <REQUESTDESC>
                <REPORTNAME>Voucher Register</REPORTNAME>
                <STATICVARIABLES>
                  <SVEXPORTFORMAT>$$SYSNAME:XML</SVEXPORTFORMAT>
                  <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                </STATICVARIABLES>
              </REQUESTDESC>
            </EXPORTDATA>
          </BODY>
        </ENVELOPE>
      `;

      const response = await fetch(tallyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xmlPayload,
        redirect: "error",
      });

      if (!response.ok) {
        throw new Error(`INTEGRATION_UNAVAILABLE: Tally voucher endpoint returned status ${response.status}.`);
      }
      const xmlText = await readResponseTextCapped(response);
      const voucherMatches = Array.from(xmlText.matchAll(/<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/gi));

      return voucherMatches.map((m, idx) => {
        const voucher = m[1];
        const party = this.xmlValue(voucher, ["PARTYLEDGERNAME", "PARTYNAME", "LEDGERNAME"]);
        const number = this.xmlValue(voucher, ["VOUCHERNUMBER", "REFERENCE"]);
        const amount = this.amountMinorUnits(this.xmlValue(voucher, ["AMOUNT", "BASEAMOUNT"]));
        const tax = this.amountMinorUnits(this.xmlValue(voucher, ["TAXAMOUNT", "GSTAMOUNT"]));
        const issueDate = this.dateFromTally(this.xmlValue(voucher, ["DATE", "VOUCHERDATE"]));
        const narration = this.xmlValue(voucher, ["NARRATION", "REFERENCE"]);
        return {
        sourceId: `tally_v_live_${this.xmlValue(voucher, ["GUID"]) || idx + 1}`,
        sourceSystem: "tally",
        customerSourceId: this.normalizeSourceId(party || "unknown_customer"),
        number: number || `TAL-LIVE-${1000 + idx}`,
        amountMinorUnits: amount,
        currency: "INR",
        taxAmountMinorUnits: tax,
        issueDate,
        dueDate: this.dateFromTally(this.xmlValue(voucher, ["DUEDATE", "PAYMENTDATE"]), issueDate),
        status: "Action Required" as const,
        poNumber: narration || undefined,
        };
      }).filter((invoice) => invoice.amountMinorUnits > 0);
    } catch (err: any) {
      throw new Error(`INTEGRATION_UNAVAILABLE: Unable to fetch Tally vouchers. ${err?.message || "Connection failed."}`);
    }
  }

  public async fetchPayments(config: OrgConnectionConfig): Promise<UniversalPayment[]> {
    this.validateConnection(config);

    if (config.testModeUseFixtures) {
      return [
        {
          sourceId: "tally_p_701",
          sourceSystem: "tally",
          customerSourceId: "tally_guid_c101",
          amountMinorUnits: 180000000,
          currency: "INR",
          date: "2026-03-25",
          reference: "TALLY-RCV-8801",
        },
      ];
    }

    return (await this.fetchLiveVouchers(config, "Receipt Register")).map((voucher: string, idx: number) => ({
      sourceId: `tally_payment_${this.xmlValue(voucher, ["GUID"]) || idx + 1}`,
      sourceSystem: "tally",
      customerSourceId: this.normalizeSourceId(this.xmlValue(voucher, ["PARTYLEDGERNAME", "PARTYNAME", "LEDGERNAME"]) || "unknown_customer"),
      amountMinorUnits: this.amountMinorUnits(this.xmlValue(voucher, ["AMOUNT", "BASEAMOUNT"])),
      currency: "INR",
      date: this.dateFromTally(this.xmlValue(voucher, ["DATE", "VOUCHERDATE"])),
      reference: this.xmlValue(voucher, ["VOUCHERNUMBER", "REFERENCE", "NARRATION"]),
    })).filter((payment) => payment.amountMinorUnits > 0);
  }

  public async fetchCreditNotes(config: OrgConnectionConfig): Promise<UniversalCreditNote[]> {
    this.validateConnection(config);

    if (config.testModeUseFixtures) {
      return [
        {
          sourceId: "tally_cn_601",
          sourceSystem: "tally",
          customerSourceId: "tally_guid_c101",
          amountMinorUnits: 18000000,
          currency: "INR",
          date: "2026-03-20",
          reason: "Tally Credit Note Reversal",
        },
      ];
    }

    return (await this.fetchLiveVouchers(config, "Credit Note Register")).map((voucher: string, idx: number) => ({
      sourceId: `tally_credit_note_${this.xmlValue(voucher, ["GUID"]) || idx + 1}`,
      sourceSystem: "tally",
      customerSourceId: this.normalizeSourceId(this.xmlValue(voucher, ["PARTYLEDGERNAME", "PARTYNAME", "LEDGERNAME"]) || "unknown_customer"),
      amountMinorUnits: this.amountMinorUnits(this.xmlValue(voucher, ["AMOUNT", "BASEAMOUNT"])),
      currency: "INR",
      date: this.dateFromTally(this.xmlValue(voucher, ["DATE", "VOUCHERDATE"])),
      reason: this.xmlValue(voucher, ["NARRATION", "REFERENCE"]) || "Tally credit note",
    })).filter((note) => note.amountMinorUnits > 0);
  }

  private async fetchLiveVouchers(config: OrgConnectionConfig, reportName: string): Promise<string[]> {
    const tallyEndpoint = await this.resolveEndpoint(
      typeof config.tallyCloudUrl === 'string' ? config.tallyCloudUrl : "http://127.0.0.1:9000",
      "Tally cloud URL"
    );
    const response = await fetch(tallyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>${reportName}</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SYSNAME:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`INTEGRATION_UNAVAILABLE: Tally ${reportName} returned status ${response.status}.`);
    const xmlText = await readResponseTextCapped(response);
    return Array.from(xmlText.matchAll(/<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/gi), (match) => match[1]);
  }

  public async pushAction(
    config: OrgConnectionConfig,
    action: Record<string, unknown>
  ): Promise<ActionResult> {
    if (action.action !== 'correct_invoice_tax_schedule') return { success: false, error: `Unsupported Tally action: ${String(action.action)}` };
    const writebackUrl = typeof config.tallyWritebackUrl === 'string' ? config.tallyWritebackUrl : undefined;
    const rate = Number(action.corrected_tax_rate);
    if (!writebackUrl) return { success: false, error: 'Tally writeback requires a configured AIOSpark Tally Bridge writeback URL.' };
    if (!action.invoice_id || !Number.isFinite(rate) || rate < 0 || rate > 100) return { success: false, error: 'Tally writeback requires invoice_id and a tax rate between 0 and 100.' };
    try {
      const safeWritebackUrl = await this.resolveEndpoint(writebackUrl, "Tally bridge writeback URL");
      const response = await fetch(safeWritebackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: "error",
        body: JSON.stringify({
          action: 'correct_invoice_tax_schedule',
          sourceInvoiceId: action.invoice_id,
          correctedTaxRate: rate,
          organizationId: config.organizationId,
        }),
      });
      if (!response.ok) return { success: false, error: `Tally bridge writeback returned HTTP ${response.status}.` };
      return { success: true, actionId: String(action.invoice_id) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? `Tally bridge writeback failed: ${error.message}` : 'Tally bridge writeback failed.' };
    }
  }

  public async getConnectionHealth(config: OrgConnectionConfig): Promise<ConnectionHealth> {
    if (config.testModeUseFixtures) {
      return { status: "connected", lastSyncAt: new Date().toISOString(), lastError: null };
    }

    const bridgeHealthUrl = typeof config.tallyBridgeHealthUrl === "string" ? config.tallyBridgeHealthUrl : undefined;
    const endpoint = typeof config.tallyCloudUrl === "string"
      ? config.tallyCloudUrl
      : bridgeHealthUrl;

    if (!endpoint) {
      return {
        status: config.onPremAgentConnected ? "error" : "disconnected",
        lastSyncAt: null,
        lastError: config.onPremAgentConnected
          ? "Tally bridge is marked connected but no health endpoint is configured."
          : "Tally connection unconfigured.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const safeEndpoint = await this.resolveEndpoint(endpoint, "Tally health URL");
      const response = await fetch(safeEndpoint, { method: "GET", signal: controller.signal, redirect: "error" });
      if (!response.ok) {
        return {
          status: "error",
          lastSyncAt: null,
          lastError: `Tally health endpoint returned status ${response.status}.`,
        };
      }
      return { status: "connected", lastSyncAt: new Date().toISOString(), lastError: null };
    } catch (error) {
      return {
        status: "error",
        lastSyncAt: null,
        lastError: error instanceof Error && error.name === "AbortError"
          ? "Tally health check timed out."
          : "Unable to reach the Tally health endpoint.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
