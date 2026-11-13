// AIOSpark PostgreSQL connection pool
// Used for atomic claim operations that require distributed safety

import { Pool } from 'pg';

// Read connection string from environment, fall back to direct config
const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'aiospark'}:${process.env.POSTGRES_PASSWORD || 'aiospark'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/aiospark`;

// Create a connection pool for atomic operations
export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Query helper that returns rows from the pool
export async function query<T>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// Query helper that returns a single row
export async function queryOne<T>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

// Close the pool on shutdown
export async function endPool(): Promise<void> {
  await pool.end();
}