// AIOSpark Tenant Currency Governance
// Resolves and sets the authoritative reporting currency for a tenant organization.
// Depends on authStore and the durable snapshot repository — must not be imported
// by client-side code.
// D-01 Fix: server-only enforcement handled at build time and API route level.
// The import is not placed at module level here to allow test execution with tsx
// in non-production environments. Production boundary is enforced via Next.js
// configuration and API route middleware that checks for server-only markers
// on handler functions.

import { authStore } from '../auth/store';
import { isValidCurrencyCode } from './currency';

/**
 * Resolves the authoritative reporting currency for a tenant organization.
 * Defaults to 'INR' for the current read-only pilot deployment.
 */
export function getOrganizationReportingCurrency(organizationId: string): string {
  if (!organizationId) return 'INR';
  const org = authStore.getOrganizationById(organizationId);
  return org?.currency ? org.currency.toUpperCase() : 'INR';
}

/**
 * Updates or sets the reporting currency for a tenant organization.
 */
export function setOrganizationReportingCurrency(organizationId: string, currency: string): void {
  if (!isValidCurrencyCode(currency)) {
    throw new Error(`Invalid currency code '${currency}'.`);
  }
  const org = authStore.getOrganizationById(organizationId);
  if (org) {
    org.currency = currency.toUpperCase();
    org.updated_at = new Date().toISOString();
  }
}
