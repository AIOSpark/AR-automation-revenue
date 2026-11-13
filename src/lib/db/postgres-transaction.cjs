/**
 * PostgreSQL transaction with transaction-local tenant context.
 * 
 * Ensures app.current_org_id is set on the same client for the entire transaction,
 * enabling RLS policies to enforce tenant isolation.
 * 
 * Usage:
 *   const result = await withPostgresTenantContext('test_org_a', async (client) => {
 *     // All tenant-scoped operations go here
 *     // The client has app.current_org_id already set
 *     const { rows } = await client.query('SELECT * FROM udm_payments WHERE id = $1', [id]);
 *     return rows;
 *   });
 * 
 * Missing tenant context will throw an error.
 */

const { Pool } = require("pg");

// Create a pool for PostgreSQL operations
const pgPool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "",
  database: "aiospark_revenue",
});

/**
 * Execute a callback with a PostgreSQL client that has tenant context set.
 * 
 * @param orgId - The organization ID to set as current_org_id (or null to clear)
 * @param callback - Async function that receives the client and returns a result
 * @returns The result of the callback
 * @throws {Error} If no client can be acquired or tenant context is missing
 */
async function withPostgresTenantContext(orgId, callback) {
  let client;
  try {
    // Acquire a client from the pool
    client = await pgPool.connect();
    
    // BEGIN transaction
    await client.query("BEGIN");
    
    // Set tenant context using set_config with true (transaction-local)
    // This ensures the setting is reset at COMMIT/ROLLBACK, not persisting across transactions
    if (orgId) {
      await client.query(
        "SELECT set_config('app.current_org_id', $1, true)",
        [orgId]
      );
    } else {
      // Clear the session context
      await client.query("RESET app.current_org_id");
    }
    
    // Execute the callback with the client
    const result = await callback(client);
    
    // COMMIT
    await client.query("COMMIT");
    
    return result;
  } catch (error) {
    // ROLLBACK on error
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        // Ignore rollback errors
      }
    }
    throw error;
  } finally {
    // Release the client back to the pool
    if (client) {
      client.release();
    }
  }
}

/**
 * Execute a query with tenant context set, using a new client for the operation.
 * 
 * @param orgId - The organization ID to set
 * @param text - The SQL query text
 * @param values - The query parameters
 * @returns The query result
 */
async function queryWithTenantContext(orgId, text, values = []) {
  let client;
  try {
    client = await pgPool.connect();
    await client.query("BEGIN");
    
    if (orgId) {
      await client.query(
        "SELECT set_config('app.current_org_id', $1, true)",
        [orgId]
      );
    } else {
      await client.query("RESET app.current_org_id");
    }
    
    const { rows } = await client.query(text, values);
    await client.query("COMMIT");
    return rows;
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Verify that the tenant context is properly set by checking current_setting.
 * 
 * @param orgId - The expected organization ID
 * @returns True if the context is set correctly
 */
async function verifyTenantContext(orgId) {
  const result = await pgPool.query(
    "SELECT current_setting('app.current_org_id', true) AS org_id"
  );
  const actual = result.rows[0].org_id;
  return actual === orgId;
}

/**
 * Clear the tenant context on all clients.
 */
async function clearAllTenantContext() {
  await pgPool.query("RESET app.current_org_id");
}

module.exports = {
  withPostgresTenantContext,
  queryWithTenantContext,
  verifyTenantContext,
  clearAllTenantContext,
  pgPool,
};