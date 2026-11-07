# AIOSpark Data Connection Layer & Adapter Abstraction (Layer 5)

## Overview & Decoupling Strategy

AIOSpark employs a strict **Adapter Abstraction Layer** ensuring downstream analytics, dashboard, AI, and reporting systems are completely decoupled from external accounting providers (Tally, Zoho, SAP, CSV/Excel).

No code outside `src/lib/adapters/` ever imports or references a vendor-specific type or schema. Downstream code consumes only standardized **Universal Data Model** records.

---

## Universal Data Model Contract (`src/lib/adapters/types.ts`)

All monetary figures are strictly represented as **integer minor units** (e.g. paise / cents) alongside ISO currency codes to avoid floating-point inaccuracies. Unique origin identity is established via `(sourceId, sourceSystem)` pairs.

```ts
export interface UniversalCustomer {
  sourceId: string;
  sourceSystem: string; // 'csv' | 'zoho' | 'tally'
  name: string;
  taxId?: string;
  contacts: Array<{ name: string; email: string; phone?: string }>;
  creditTermsDays: number;
}

export interface UniversalInvoice {
  sourceId: string;
  sourceSystem: string;
  customerSourceId: string;
  number: string;
  amountMinorUnits: number; // e.g. ₹18,00,000.00 = 180000000
  currency: string; // 'INR', 'USD', etc.
  taxAmountMinorUnits: number;
  issueDate: string;
  dueDate: string;
  status: "Payment Blocked" | "Action Required" | "Escalated" | "Cleared" | "Pending";
  poNumber?: string;
}

export interface UniversalPayment {
  sourceId: string;
  sourceSystem: string;
  customerSourceId: string;
  amountMinorUnits: number;
  currency: string;
  date: string;
  reference?: string;
}

export interface UniversalCreditNote {
  sourceId: string;
  sourceSystem: string;
  customerSourceId: string;
  amountMinorUnits: number;
  currency: string;
  date: string;
  reason?: string;
}
```

---

## The `DataAdapter` Interface

Every ingestion source implements the exact same interface contract:

```ts
export interface DataAdapter {
  adapterType: string;
  fetchCustomers(config: OrgConnectionConfig): Promise<UniversalCustomer[]>;
  fetchInvoices(config: OrgConnectionConfig): Promise<UniversalInvoice[]>;
  fetchPayments(config: OrgConnectionConfig): Promise<UniversalPayment[]>;
  fetchCreditNotes(config: OrgConnectionConfig): Promise<UniversalCreditNote[]>;
  pushAction(config: OrgConnectionConfig, action: Record<string, unknown>): Promise<{ success: boolean; actionId?: string; error?: string }>;
  getConnectionHealth(config: OrgConnectionConfig): Promise<{ status: "connected" | "syncing" | "error" | "disconnected"; lastSyncAt: string | null; lastError: string | null }>;
}
```

---

## Adapter Implementations

### 1. `CSVAdapter` (`src/lib/adapters/csv.ts`)
- **First-class Ingestion Path**: Parses `.csv`, `.xlsx`, `.xls` file buffers.
- Converts raw string amounts into integer minor units (`amountMinorUnits = Math.round(val * 100)`).
- Saves column mappings per organization for auto-re-use.

### 2. `ZohoBooksAdapter` (`src/lib/adapters/zoho.ts`)
- **OAuth 2.0 Integration**: Redirects to Zoho consent screen, handles token exchange.
- **Credential Encryption**: Refresh tokens and access secrets are encrypted at rest using AES-256-GCM (`src/lib/adapters/crypto.ts`). Tokens are NEVER stored in plain text.
- **Rate Limit & Exponential Backoff**: Implements exponential backoff on HTTP `429 Too Many Requests` (retries up to 4 attempts with randomized jitter).

### 3. `TallyAdapter` & On-Premise Connector Architecture (`src/lib/adapters/tally.ts`)
- **On-Premise Connector Agent**: Most Tally instances in India run on local desktop Windows networks without direct public HTTP endpoints.
- **Agent Architecture**: AIOSpark provides a lightweight, background Windows service (`AIOSpark-Tally-Bridge.exe`) running locally on the customer's network. The local agent polls Tally's local XML/ODBC interface (`http://localhost:9000`) and securely pushes encrypted payload batches over HTTPS to AIOSpark's ingestion endpoint.
- **Cloud API**: Supports direct Tally Cloud XML ingestion for hosted Tally Prime instances.

---

## Database Schema (`src/lib/adapters/schema-integrations.sql`)

```sql
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  adapter_type TEXT NOT NULL CHECK (adapter_type IN ('csv', 'zoho', 'tally')),
  config_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'syncing', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, adapter_type)
);
```

---

## Shared Contract Testing

Run the adapter contract test suite verifying that all adapters produce validly-shaped Universal records and that downstream queries function identically regardless of data source:

```bash
npm run test:adapters
```
