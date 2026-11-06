// AIOSpark Database Client & Repository Factory
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { getSecurityMigrationSQL } from './security-migrations';

class DatabaseService {
  private static instance: DatabaseService;
  private pgliteInstance: PGlite | null = null;
  private dbClient: ReturnType<typeof drizzle> | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async getDb() {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.dbClient!;
  }

  public async init() {
    if (this.isInitialized) return;

    this.pgliteInstance = new PGlite();
    this.dbClient = drizzle(this.pgliteInstance, { schema });

    // Initialize schema and security policies
    await this.pgliteInstance.exec(`
      CREATE TYPE role_enum AS ENUM ('Admin', 'Manager', 'Analyst', 'Viewer');
      CREATE TYPE payment_delay_category_enum AS ENUM ('NORMAL_CYCLE', 'PAYMENT_PROMISED', 'CUSTOMER_DISPUTE', 'PO_MISMATCH', 'INVOICE_ERROR', 'GST_TAX_ISSUE', 'MISSING_DOCUMENT', 'DELIVERY_ISSUE', 'APPROVAL_PENDING', 'CREDIT_ISSUE', 'UNKNOWN');
      CREATE TYPE actor_type_enum AS ENUM ('user', 'agent', 'system');
      CREATE TYPE audit_result_enum AS ENUM ('success', 'failure', 'reverted');

      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT,
        tax_id TEXT,
        email TEXT,
        phone TEXT,
        credit_limit_minor_units BIGINT NOT NULL DEFAULT 0,
        credit_terms_days INT NOT NULL DEFAULT 30,
        risk_score INT NOT NULL DEFAULT 50,
        currency TEXT NOT NULL DEFAULT 'INR',
        import_batch_id TEXT,
        source_file_name TEXT,
        source_sheet_name TEXT,
        source_row_number INT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customer_contacts (
        id TEXT PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        role TEXT,
        is_primary INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        number TEXT NOT NULL,
        issue_date TIMESTAMPTZ NOT NULL,
        due_date TIMESTAMPTZ NOT NULL,
        amount_minor_units BIGINT NOT NULL,
        paid_amount_minor_units BIGINT NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'UNPAID',
        po_number TEXT,
        source_system TEXT NOT NULL DEFAULT 'MANUAL',
        payment_delay_category payment_delay_category_enum DEFAULT 'NORMAL_CYCLE',
        import_batch_id TEXT,
        source_file_name TEXT,
        source_sheet_name TEXT,
        source_row_number INT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        payment_date TIMESTAMPTZ NOT NULL,
        amount_minor_units BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        reference_number TEXT,
        payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
        import_batch_id TEXT,
        source_file_name TEXT,
        source_sheet_name TEXT,
        source_row_number INT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        actor_user_id UUID,
        actor_type actor_type_enum NOT NULL DEFAULT 'system',
        action_type TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        before_state TEXT,
        after_state TEXT,
        ai_context TEXT,
        approval_context TEXT,
        result audit_result_enum NOT NULL DEFAULT 'success',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Apply security migrations (RLS + Triggers)
    await this.pgliteInstance.exec(getSecurityMigrationSQL());

    this.isInitialized = true;
  }

  public async setTenantContext(orgId: string | null) {
    if (!this.pgliteInstance) return;
    if (orgId) {
      await this.pgliteInstance.exec(`SET app.current_tenant_id = '${orgId}';`);
    } else {
      await this.pgliteInstance.exec(`RESET app.current_tenant_id;`);
    }
  }
}

export const dbService = DatabaseService.getInstance();
