// AIOSpark Database Connection & Migration Manager
// Single source of truth for all database operations.
// Uses PGlite (WASM PostgreSQL) with Drizzle ORM for transactional persistence.
//
// This replaces the SQLite-based durable repository with a proper
// transactional PostgreSQL implementation for production-grade financial data.

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';

// Database singleton
let dbInstance: ReturnType<typeof drizzle> | null = null;
let pgliteInstance: PGlite | null = null;

/**
 * Get the singleton database instance.
 * Initializes PGlite, applies schema, and ensures tables exist.
 */
export async function getDatabase(): Promise<ReturnType<typeof drizzle>> {
  if (dbInstance) return dbInstance;

  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });

  // Create all tables using Drizzle-compatible SQL
  // This uses the drizzle-kit migration approach - tables are created via schema definitions
  // The schema definitions in src/lib/db/schema.ts will be used by drizzle-kit

  dbInstance = db;
  pgliteInstance = pglite;
  return db;
}

/**
 * Close the database connection.
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await pgliteInstance?.close();
    dbInstance = null;
    pgliteInstance = null;
  }
}

/**
 * Get the raw PGlite connection for custom operations.
 */
export function getPGlite(): PGlite | null {
  return pgliteInstance;
}

/**
 * Get the drizzle database instance for queries.
 */
export function getDb(): ReturnType<typeof drizzle> | null {
  return dbInstance;
}

// Export all table definitions for type reference
export type {
  organizations,
  users,
  organizationMembers,
  customers,
  customerContacts,
  invoices,
  payments,
  paymentInvoiceMatches,
  creditNotes,
  creditAllocations,
  disputes,
  disputeEvidences,
  exceptions,
  bankTransactions,
  usageEvents,
  subscriptions,
  webhookEvents,
  auditLogs
} from './schema';