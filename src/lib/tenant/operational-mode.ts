// AIOSpark Operational Mode Enforcement (Layer 2)
// Defines and enforces operational modes for the application.
// Three modes:
//   - development: Full access, development auth allowed, no external restrictions
//   - pilot:       Restricted pilot mode - no financial mutations, no external
//                  payment execution, no external messages, no ERP writeback,
//                  no approval bypass. Enforced at the data layer.
//   - production:  Full customer operational mode with proper authentication
//                  and authorization.

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
 * Returns true if the current mode is pilot or production (i.e., not development).
 */
export function isRestrictedMode(): boolean {
  return getOperationalMode() !== 'development';
}

/**
 * Returns true if the current mode is pilot (restricted pilot mode).
 * In pilot mode, financial mutations and external integrations are blocked.
 */
export function isPilotMode(): boolean {
  return getOperationalMode() === 'pilot';
}

/**
 * Asserts that a financial mutation is allowed in the current operational mode.
 * Throws an error if the mode is pilot (restricted) and the operation is a
 * write/mutation that would change financial state.
 *
 * Call this at the start of any service/data-layer function that performs
 * a financial mutation (insert, update, delete, match, allocate, reverse).
 */
export function assertFinancialWriteAllowed(operation: string): void {
  if (isPilotMode()) {
    throw new Error(
      `Financial write blocked in pilot mode: ${operation}. ` +
      'Pilot mode is read-only for financial data. ' +
      'Set AIOSPARK_OPERATIONAL_MODE=production to enable financial mutations.'
    );
  }
}

/**
 * Asserts that external integration calls are allowed in the current mode.
 * Throws an error if the mode is pilot.
 */
export function assertExternalIntegrationAllowed(integration: string): void {
  if (isPilotMode()) {
    throw new Error(
      `External integration blocked in pilot mode: ${integration}. ` +
      'Pilot mode does not allow external calls. ' +
      'Set AIOSPARK_OPERATIONAL_MODE=production to enable integrations.'
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
      return 'Pilot mode - read-only for financial data, no external integrations';
    case 'production':
      return 'Production mode - full customer operational mode';
    default:
      return 'Unknown mode';
  }
}
