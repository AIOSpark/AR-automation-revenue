// AIOSpark Operational Mode Enforcement (Layer 2)
// Defines and enforces operational modes for the application.
// Three modes:
//   - development: Full access, development auth allowed, no external restrictions
//   - pilot:       Restricted pilot mode - no financial mutations, no external
//                  payment execution, no external messages, no ERP writeback,
//                  no approval bypass. Enforced at the data layer.
//   - production:  Read-only customer operational mode - financial mutations blocked,
//                  external integrations blocked, read-only financial visibility.
//                 Authentication and tenant isolation are enforced.

export type OperationalMode = 'development' | 'pilot' | 'production';

/**
 * Reads the operational mode from environment variables.
 * Defaults to 'development' if not set.
 */
export function getOperationalMode(): OperationalMode {
  const raw = process.env.AIOSPARK_OPERATIONAL_MODE;
  if (raw === 'pilot' || raw === 'production') return raw;
  return 'development';
}

/**
 * Returns true if the current mode is pilot.
 * In pilot mode, financial mutations and external integrations are blocked.
 * This is independent of production mode.
 */
export function isPilotMode(): boolean {
  return getOperationalMode() === 'pilot';
}

/**
 * Returns true if the current mode is production.
 * In production mode, financial mutations and external integrations are blocked
 * per Scenario A read-only pilot policy. This is independent of pilot mode.
 */
export function isProductionMode(): boolean {
  return getOperationalMode() === 'production';
}

/**
 * Returns true if the current mode is restricted (pilot or production).
 * In restricted modes, financial mutations and external integrations are blocked.
 * This combines both pilot and production modes.
 */
export function isRestrictedMode(): boolean {
  return getOperationalMode() !== 'development';
}

/**
 * Returns true if financial mutations are blocked in the current mode.
 * In Scenario A, both pilot and production modes are read-only for financial data.
 * This is the combined check for Scenario A's read-only pilot policy.
 * Future commercial production may allow certain financial operations
 * based on RBAC even in production mode.
 */
export function isFinancialWriteBlocked(): boolean {
  // Scenario A: both pilot and production modes block financial mutations.
  // Future commercial production may allow certain financial operations
  // based on RBAC even in production mode.
  return isPilotMode() || isProductionMode();
}

/**
 * Asserts that a financial mutation is allowed in the current operational mode.
 * Throws an error if financial writes are blocked for the current mode.
 * Call this at the start of any service/data-layer function that performs
 * a financial mutation (insert, update, delete, match, allocate, reverse).
 */
export function assertFinancialWriteAllowed(operation: string): void {
  if (isFinancialWriteBlocked()) {
    throw new Error(
      `Financial write blocked in pilot/production mode: ${operation}. ` +
      'Pilot/production mode is read-only for financial data. ' +
      'Financial mutations require development mode or explicit authorization.'
    );
  }
}

/**
 * Asserts that external integration calls are allowed in the current mode.
 * Throws an error if the mode is restricted (not development).
 */
export function assertExternalIntegrationAllowed(integration: string): void {
  if (getOperationalMode() !== 'development') {
    throw new Error(
      `External integration blocked in pilot/production mode: ${integration}. ` +
      'Pilot/production mode is read-only for external integrations. ' +
      'Set AIOSPARK_OPERATIONAL_MODE=development to enable external calls.'
    );
  }
}

/**
 * Returns a human-readable description of the current operational mode.
 */
export function getOperationalModeDescription(): string {
  switch (getOperationalMode()) {
    case 'development':
      return 'Development mode - full access, development auth allowed';
    case 'pilot':
      return 'Pilot mode - read-only for financial data and external integrations; no external messages, no ERP writeback, no approval bypass.';
    case 'production':
      return 'Production mode - read-only for financial data and external integrations; customer financial visibility only.';
    default:
      return 'Unknown mode';
  }
}