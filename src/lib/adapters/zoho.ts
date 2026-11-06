// AIOSpark Zoho Books DataAdapter Implementation (Adapter #2)

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
import { encryptSecret, decryptSecret } from "./crypto";
import { integrationsStore } from "./store";

export class ZohoBooksAdapter implements DataAdapter {
  public readonly adapterType = "zoho";

  private getCredentials(config: OrgConnectionConfig): Record<string, any> {
    const raw = config.credentials as Record<string, any> | undefined;
    if (raw) return raw;
    if (config.credentialsEncrypted) {
      try {
        const decrypted = JSON.parse(decryptSecret(config.credentialsEncrypted));
        return (decrypted.credentials || decrypted) as Record<string, any>;
      } catch {
        throw new Error("AUTHENTICATION_REQUIRED: Zoho credentials could not be decrypted.");
      }
    }
    throw new Error("AUTHENTICATION_REQUIRED: Zoho Books credentials not configured for organization.");
  }

  private getApiDomain(credentials: Record<string, any>): string {
    const domain = String(credentials.apiDomain || process.env.ZOHO_BOOKS_API_DOMAIN || "https://www.zohoapis.com");
    return domain.replace(/\/$/, "");
  }

  private async refreshAccessToken(config: OrgConnectionConfig, credentials: Record<string, any>): Promise<Record<string, any>> {
    if (!credentials.refreshToken || !credentials.clientId || !credentials.clientSecret) {
      throw new Error("AUTHENTICATION_REQUIRED: Zoho OAuth refresh credentials are missing.");
    }

    const accountsDomain = String(credentials.accountsDomain || process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.com").replace(/\/$/, "");
    const response = await fetch(`${accountsDomain}/oauth/v2/token`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: credentials.refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: "refresh_token",
      }).toString(),
    });
    if (!response.ok) throw new Error("AUTHENTICATION_REQUIRED: Zoho OAuth refresh failed.");
    const tokenData = await response.json();
    const updated = { ...credentials, token: tokenData.access_token, expiresAt: Date.now() + (Number(tokenData.expires_in || 3600) * 1000) };
    integrationsStore.saveIntegration({
      organization_id: config.organizationId,
      adapter_type: "zoho",
      rawConfig: { credentials: updated },
      status: "connected",
    });
    return updated;
  }

  private async requestJson(config: OrgConnectionConfig, path: string, params: Record<string, string> = {}): Promise<any> {
    let credentials = this.getCredentials(config);
    if (!credentials.token) throw new Error("AUTHENTICATION_REQUIRED: Zoho access token is missing.");
    const makeRequest = async () => fetch(`${this.getApiDomain(credentials)}${path}?${new URLSearchParams(params)}`, {
      redirect: "error",
      headers: { Authorization: `Zoho-oauthtoken ${credentials.token}` },
    });
    let response = await makeRequest();
    if (response.status === 401 && credentials.refreshToken) {
      credentials = await this.refreshAccessToken(config, credentials);
      response = await makeRequest();
    }
    if (response.status === 429) {
      const error = new Error("RATE_LIMIT: Zoho API rate limit reached.") as Error & { status?: number };
      error.status = 429;
      throw error;
    }
    if (!response.ok) {
      throw new Error(`INTEGRATION_UNAVAILABLE: Zoho API returned status ${response.status}.`);
    }
    return response.json();
  }

  /**
   * Exponential Backoff & Retry Fetcher respecting Zoho Rate Limits
   */
  private async fetchWithRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (err: any) {
        attempt++;
        const transient = err?.status === 429 || [408, 425, 500, 502, 503, 504].includes(err?.status) || /network|timeout|ECONNRESET/i.test(String(err?.message));
        if (transient && attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 500 + Math.random() * 200;
          console.warn(`Zoho Rate Limit hit (HTTP 429). Retrying attempt ${attempt} in ${backoffMs}ms...`);
          await new Promise((res) => setTimeout(res, backoffMs));
        } else {
          throw err;
        }
      }
    }
    return fn();
  }

  private async fetchAllPages(
    config: OrgConnectionConfig,
    path: string,
    params: Record<string, string>,
    collectionKey: string,
  ): Promise<any[]> {
    const records: any[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const data = await this.fetchWithRateLimitRetry(() => this.requestJson(config, path, {
        ...params,
        page: String(page),
        per_page: '200',
      }));
      const pageRecords = Array.isArray(data?.[collectionKey]) ? data[collectionKey] : [];
      records.push(...pageRecords);
      const context = data?.page_context || {};
      const totalPages = Number(context.total_pages || 0);
      const hasMore = context.has_more_page === true || context.has_more_page === 'true';
      if (pageRecords.length === 0 || (!hasMore && (!totalPages || page >= totalPages))) break;
    }
    return records;
  }

  /**
   * Validates whether live Zoho Books credentials exist for the organization.
   * If credentials are missing, throws structured AUTHENTICATION_REQUIRED error to prevent mock data ingestion.
   */
  private validateCredentials(config: OrgConnectionConfig): void {
    if (!config.credentialsEncrypted && !config.credentials && !config.testModeUseFixtures) {
      throw new Error("AUTHENTICATION_REQUIRED: Zoho Books credentials not configured for organization.");
    }
  }

  public async fetchCustomers(config: OrgConnectionConfig): Promise<UniversalCustomer[]> {
    this.validateCredentials(config);

    return this.fetchWithRateLimitRetry(async () => {
      // In test mode with explicit testModeUseFixtures flag, return test fixtures
      if (config.testModeUseFixtures) {
        const testZohoContacts = [
          { contact_id: "zh_c_901", contact_name: "Apex Tech Logistics Pvt Ltd", gst_no: "27AAACA00001Z5", email: "ap@apextech.com", payment_terms: 30 },
          { contact_id: "zh_c_902", contact_name: "Global Nexus Retail Ltd", gst_no: "27BBBCB00002Z6", email: "billing@nexusretail.com", payment_terms: 45 },
        ];

        return testZohoContacts.map((c) => ({
          sourceId: c.contact_id,
          sourceSystem: "zoho",
          name: c.contact_name,
          taxId: c.gst_no,
          contacts: [{ name: "Zoho Primary AP", email: c.email }],
          creditTermsDays: c.payment_terms,
        }));
      }

      const records = await this.fetchAllPages(config, "/api/v3/contacts", {
        organization_id: this.getCredentials(config).organizationId,
        contact_type: "customer",
      }, 'contacts');
      return records.map((c: any) => ({
        sourceId: String(c.contact_id),
        sourceSystem: "zoho",
        name: c.contact_name || c.company_name || "Zoho Customer",
        taxId: c.gst_no,
        contacts: [{ name: c.contact_name || c.company_name || "Primary Contact", email: c.email || "" }],
        creditTermsDays: Number(c.payment_terms || 30),
      }));
    });
  }

  public async fetchInvoices(config: OrgConnectionConfig): Promise<UniversalInvoice[]> {
    this.validateCredentials(config);

    return this.fetchWithRateLimitRetry(async () => {
      if (config.testModeUseFixtures) {
        const testZohoInvoices = [
          { invoice_id: "zh_inv_501", customer_id: "zh_c_901", invoice_number: "Z-INV-1021", total: 1800000, currency_code: "INR", date: "2026-03-01", due_date: "2026-03-31", status: "overdue", reference_number: "PO-9921" },
          { invoice_id: "zh_inv_502", customer_id: "zh_c_902", invoice_number: "Z-INV-1022", total: 2250000, currency_code: "INR", date: "2026-03-10", due_date: "2026-04-24", status: "unpaid", reference_number: "PO-9922" },
        ];

        return testZohoInvoices.map((inv) => ({
          sourceId: inv.invoice_id,
          sourceSystem: "zoho",
          customerSourceId: inv.customer_id,
          number: inv.invoice_number,
          amountMinorUnits: Math.round(inv.total * 100),
          currency: inv.currency_code,
          taxAmountMinorUnits: Math.round(inv.total * 100 * 0.18),
          issueDate: inv.date,
          dueDate: inv.due_date,
          status: inv.status === "overdue" ? "Payment Blocked" : "Action Required",
          poNumber: inv.reference_number,
        }));
      }

      const creds = this.getCredentials(config);
      const liveInvoices = await this.fetchAllPages(config, "/api/v3/invoices", {
        organization_id: String(creds.organizationId),
      }, 'invoices');

      return liveInvoices.map((inv: any) => ({
          sourceId: String(inv.invoice_id),
          sourceSystem: "zoho",
          customerSourceId: String(inv.customer_id),
          number: inv.invoice_number,
          amountMinorUnits: Math.round((inv.total || 0) * 100),
          currency: inv.currency_code || "INR",
          taxAmountMinorUnits: Math.round((inv.tax_total || 0) * 100),
          issueDate: inv.date,
          dueDate: inv.due_date,
          status: inv.status === "overdue" ? "Payment Blocked" : "Action Required",
          poNumber: inv.reference_number || "PO-ZOHO-LIVE",
        }));
    });
  }

  public async fetchPayments(config: OrgConnectionConfig): Promise<UniversalPayment[]> {
    this.validateCredentials(config);

    return this.fetchWithRateLimitRetry(async () => {
      if (config.testModeUseFixtures) {
        return [
          {
            sourceId: "zh_pay_301",
            sourceSystem: "zoho",
            customerSourceId: "zh_c_901",
            amountMinorUnits: 180000000,
            currency: "INR",
            date: "2026-03-15",
            reference: "ZOHO-PAY-991",
          },
        ];
      }
      const creds = this.getCredentials(config);
      const records = await this.fetchAllPages(config, "/api/v3/customerpayments", {
        organization_id: String(creds.organizationId),
      }, 'customerpayments');
      return records.map((p: any) => ({
        sourceId: String(p.payment_id),
        sourceSystem: "zoho",
        customerSourceId: String(p.customer_id),
        amountMinorUnits: Math.round(Number(p.amount || 0) * 100),
        currency: p.currency_code || "INR",
        date: p.date,
        reference: p.reference_number || p.payment_number,
      }));
    });
  }

  public async fetchCreditNotes(config: OrgConnectionConfig): Promise<UniversalCreditNote[]> {
    this.validateCredentials(config);

    return this.fetchWithRateLimitRetry(async () => {
      if (config.testModeUseFixtures) {
        return [
          {
            sourceId: "zh_cn_201",
            sourceSystem: "zoho",
            customerSourceId: "zh_c_901",
            amountMinorUnits: 18000000,
            currency: "INR",
            date: "2026-03-12",
            reason: "Zoho Credit Note Rate Variance",
          },
        ];
      }
      const creds = this.getCredentials(config);
      const records = await this.fetchAllPages(config, "/api/v3/creditnotes", {
        organization_id: String(creds.organizationId),
      }, 'creditnotes');
      return records.map((n: any) => ({
        sourceId: String(n.creditnote_id),
        sourceSystem: "zoho",
        customerSourceId: String(n.customer_id),
        amountMinorUnits: Math.round(Number(n.total || 0) * 100),
        currency: n.currency_code || "INR",
        date: n.date,
        reason: n.reference_number || "Zoho credit note",
      }));
    });
  }

  public async pushAction(
    config: OrgConnectionConfig,
    action: Record<string, unknown>
  ): Promise<ActionResult> {
    if (action.action !== 'correct_invoice_tax_schedule') return { success: false, error: `Unsupported Zoho action: ${String(action.action)}` };
    const invoiceId = String(action.invoice_id || '');
    const rate = Number(action.corrected_tax_rate);
    if (!invoiceId || !Number.isFinite(rate) || rate < 0 || rate > 100) return { success: false, error: 'Zoho writeback requires invoice_id and a tax rate between 0 and 100.' };
    const credentials = this.getCredentials(config);
    const makeRequest = async (token: string) => fetch(`${this.getApiDomain(credentials)}/api/v3/invoices/${encodeURIComponent(invoiceId)}?${new URLSearchParams({ organization_id: String(credentials.organizationId) })}`, {
      method: 'PUT',
      redirect: 'error',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tax_percentage: rate }),
    });
    let response = await makeRequest(String(credentials.token || ''));
    if (response.status === 401 && credentials.refreshToken) {
      const refreshed = await this.refreshAccessToken(config, credentials);
      response = await makeRequest(String(refreshed.token));
    }
    if (!response.ok) return { success: false, error: `Zoho Books writeback returned HTTP ${response.status}.` };
    return { success: true, actionId: invoiceId };
  }

  public async getConnectionHealth(config: OrgConnectionConfig): Promise<ConnectionHealth> {
    const hasCreds = Boolean(config.credentialsEncrypted || config.credentials);
    if (hasCreds && !config.testModeUseFixtures) {
      try {
        const creds = this.getCredentials(config);
        if (!creds.organizationId) throw new Error("Zoho Books organization is not selected.");
        await this.requestJson(config, "/api/v3/organizations", {});
      } catch (error: any) {
        return { status: "error", lastSyncAt: null, lastError: error.message || "Zoho health check failed." };
      }
    }
    return {
      status: hasCreds ? "connected" : "disconnected",
      lastSyncAt: hasCreds ? new Date().toISOString() : null,
      lastError: hasCreds ? null : "Zoho Books credentials not configured.",
    };
  }
}
