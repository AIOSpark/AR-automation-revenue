import { PGlite } from '@electric-sql/pglite';
import { getSecurityMigrationSQL } from '../src/lib/db/security-migrations.ts';

async function runSecurityVerificationSuite() {
  console.log('================================================================');
  console.log('AIOSpark Real-PostgreSQL Security & Immutability Verification');
  console.log('================================================================\n');

  // Initialize in-memory real WASM PostgreSQL engine
  const db = new PGlite();

  // 1. Create Base Schema
  console.log('1. Setting up PostgreSQL types & Drizzle Schema...');
  await db.exec(`
    CREATE TYPE role_enum AS ENUM ('Admin', 'Manager', 'Analyst', 'Viewer');
    CREATE TYPE payment_delay_category_enum AS ENUM ('NORMAL_CYCLE', 'PAYMENT_PROMISED', 'CUSTOMER_DISPUTE', 'PO_MISMATCH', 'INVOICE_ERROR', 'GST_TAX_ISSUE', 'MISSING_DOCUMENT', 'DELIVERY_ISSUE', 'APPROVAL_PENDING', 'CREDIT_ISSUE', 'UNKNOWN');
    CREATE TYPE actor_type_enum AS ENUM ('user', 'agent', 'system');
    CREATE TYPE audit_result_enum AS ENUM ('success', 'failure', 'reverted');

    CREATE TABLE organizations (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE customer_contacts (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE invoices (
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
      payment_delay_category payment_delay_category_enum DEFAULT 'NORMAL_CYCLE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      payment_date TIMESTAMPTZ NOT NULL,
      amount_minor_units BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE audit_logs (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_user_id UUID,
      actor_type actor_type_enum NOT NULL DEFAULT 'system',
      action_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      result audit_result_enum NOT NULL DEFAULT 'success',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('   ✓ PostgreSQL tables and native ENUM types created successfully.');

  // 2. Apply RLS & Triggers
  console.log('\n2. Applying Layer 3 RLS Policies & Layer 26 Audit Triggers...');
  await db.exec(getSecurityMigrationSQL());

  // Create standard non-superuser database role to test RLS enforcement
  await db.exec(`
    CREATE ROLE app_user WITH LOGIN;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
    ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
    ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
  `);
  console.log('   ✓ RLS policies, FORCE ROW LEVEL SECURITY, and audit trigger active.');

  // 3. Seed Multi-Tenant Data
  console.log('\n3. Seeding Organizations A & B data...');
  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';

  await db.exec(`
    INSERT INTO organizations (id, name, slug) VALUES ('${orgA}', 'Org Alpha', 'alpha');
    INSERT INTO organizations (id, name, slug) VALUES ('${orgB}', 'Org Beta', 'beta');

    INSERT INTO customers (id, organization_id, name) VALUES ('cust_a', '${orgA}', 'Alpha Customer');
    INSERT INTO customers (id, organization_id, name) VALUES ('cust_b', '${orgB}', 'Beta Customer');

    INSERT INTO invoices (id, organization_id, customer_id, number, issue_date, due_date, amount_minor_units, status)
    VALUES ('inv_a', '${orgA}', 'cust_a', 'INV-A-100', NOW(), NOW(), 500000, 'UNPAID');

    INSERT INTO invoices (id, organization_id, customer_id, number, issue_date, due_date, amount_minor_units, status)
    VALUES ('inv_b', '${orgB}', 'cust_b', 'INV-B-200', NOW(), NOW(), 750000, 'UNPAID');

    INSERT INTO audit_logs (id, organization_id, action_type, subject_type, subject_id, result)
    VALUES ('33333333-3333-3333-3333-333333333333', '${orgA}', 'invoice.created', 'invoice', 'inv_a', 'success');
  `);
  console.log('   ✓ Seeded Org A (Invoice inv_a) and Org B (Invoice inv_b).');

  // Switch connection context to unprivileged app_user role
  await db.exec(`SET ROLE app_user;`);

  // 4. ADVERSARIAL TEST 1: Tenant RLS Read Isolation (SELECT)
  console.log('\n4. Executing Adversarial Test 1: Tenant RLS Read Isolation (SELECT)...');
  await db.exec(`SET app.current_tenant_id = '${orgA}';`);
  const selectRes = await db.query(`SELECT * FROM invoices;`);
  if (selectRes.rows.length === 1 && selectRes.rows[0].id === 'inv_a') {
    console.log('   PASS: Org A query returned ONLY inv_a. Cross-tenant invoice inv_b is completely invisible.');
  } else {
    throw new Error(`FAIL: RLS SELECT breach! Returned: ${JSON.stringify(selectRes.rows)}`);
  }

  // 5. ADVERSARIAL TEST 2: Tenant RLS Write Isolation (UPDATE & DELETE)
  console.log('\n5. Executing Adversarial Test 2: Tenant RLS Write Isolation (UPDATE/DELETE)...');
  // Attempt to update Org B invoice while authenticated as Org A
  const updateRes = await db.query(`UPDATE invoices SET amount_minor_units = 0 WHERE id = 'inv_b';`);
  if (updateRes.affectedRows === 0) {
    console.log('   PASS: Cross-tenant UPDATE blocked by Postgres RLS (0 affected rows).');
  } else {
    throw new Error(`FAIL: RLS UPDATE breach! Org A modified Org B invoice!`);
  }

  const deleteRes = await db.query(`DELETE FROM invoices WHERE id = 'inv_b';`);
  if (deleteRes.affectedRows === 0) {
    console.log('   PASS: Cross-tenant DELETE blocked by Postgres RLS (0 affected rows).');
  } else {
    throw new Error(`FAIL: RLS DELETE breach! Org A deleted Org B invoice!`);
  }

  // 6. ADVERSARIAL TEST 3: Layer 26 Audit Log Database Immutability Trigger
  console.log('\n6. Executing Adversarial Test 3: Database Audit Log Immutability Trigger...');
  try {
    await db.exec(`UPDATE audit_logs SET action_type = 'tampered' WHERE id = '33333333-3333-3333-3333-333333333333';`);
    throw new Error('FAIL: Audit log UPDATE was allowed by database!');
  } catch (err) {
    if (err.message.includes('Audit logs are strictly immutable')) {
      console.log('   PASS: Audit log UPDATE caught and rejected by PostgreSQL Trigger!');
    } else {
      throw err;
    }
  }

  try {
    await db.exec(`DELETE FROM audit_logs WHERE id = '33333333-3333-3333-3333-333333333333';`);
    throw new Error('FAIL: Audit log DELETE was allowed by database!');
  } catch (err) {
    if (err.message.includes('Audit logs are strictly immutable')) {
      console.log('   PASS: Audit log DELETE caught and rejected by PostgreSQL Trigger!');
    } else {
      throw err;
    }
  }

  console.log('\n================================================================');
  console.log('ALL REAL-POSTGRESQL SECURITY & IMMUTABILITY TESTS PASSED 100%');
  console.log('================================================================');
}

runSecurityVerificationSuite().catch((err) => {
  console.error('\nSECURITY VERIFICATION FAILED:', err);
  process.exit(1);
});
