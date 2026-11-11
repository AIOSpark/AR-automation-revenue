// AIOSpark Financial Truth Layer — ISO 4217 Currency Standards (Sprint 22 Priority 1)
// Pure, client-safe currency definitions. No server-side persistence or auth dependency.
// Tenant org-currency resolution lives in ./currency-org (server-only).

export interface CurrencyDefinition {
  code: string;
  minorUnitDigits: number;
  symbol: string;
  name: string;
  defaultLocale: string;
}

export const CURRENCY_REGISTRY: Record<string, CurrencyDefinition> = {
  INR: {
    code: 'INR',
    minorUnitDigits: 2,
    symbol: '₹',
    name: 'Indian Rupee',
    defaultLocale: 'en-IN',
  },
  USD: {
    code: 'USD',
    minorUnitDigits: 2,
    symbol: '$',
    name: 'US Dollar',
    defaultLocale: 'en-US',
  },
  EUR: {
    code: 'EUR',
    minorUnitDigits: 2,
    symbol: '€',
    name: 'Euro',
    defaultLocale: 'de-DE',
  },
  GBP: {
    code: 'GBP',
    minorUnitDigits: 2,
    symbol: '£',
    name: 'British Pound',
    defaultLocale: 'en-GB',
  },
  AED: {
    code: 'AED',
    minorUnitDigits: 2,
    symbol: 'AED',
    name: 'UAE Dirham',
    defaultLocale: 'ar-AE',
  },
  SGD: {
    code: 'SGD',
    minorUnitDigits: 2,
    symbol: 'S$',
    name: 'Singapore Dollar',
    defaultLocale: 'en-SG',
  },
  JPY: {
    code: 'JPY',
    minorUnitDigits: 0,
    symbol: '¥',
    name: 'Japanese Yen',
    defaultLocale: 'ja-JP',
  },
};

/**
 * Returns standard currency definition or creates a fallback for valid ISO 4217 codes.
 */
export function getCurrencyDefinition(currencyCode: string): CurrencyDefinition {
  const normalized = (currencyCode || 'INR').trim().toUpperCase();
  if (CURRENCY_REGISTRY[normalized]) {
    return CURRENCY_REGISTRY[normalized];
  }
  // Generic ISO 4217 code (default to 2 decimals)
  if (/^[A-Z]{3}$/.test(normalized)) {
    return {
      code: normalized,
      minorUnitDigits: 2,
      symbol: `${normalized} `,
      name: normalized,
      defaultLocale: 'en-US',
    };
  }
  throw new Error(`Unsupported currency code '${currencyCode}'. Must be a valid 3-letter ISO 4217 currency code.`);
}

/**
 * Validates whether the currency code is recognized or a valid ISO 4217 3-letter code.
 */
export function isValidCurrencyCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const normalized = code.trim().toUpperCase();
  return Boolean(CURRENCY_REGISTRY[normalized]) || /^[A-Z]{3}$/.test(normalized);
}

/**
 * Strict currency match assertion preventing multi-currency contamination.
 */
export function assertMatchingCurrency(
  entityCurrency: string,
  expectedCurrency: string,
  contextMessage?: string
): void {
  const normA = (entityCurrency || '').trim().toUpperCase();
  const normB = (expectedCurrency || '').trim().toUpperCase();
  if (normA !== normB) {
    const msg = contextMessage ? ` (${contextMessage})` : '';
    throw new Error(
      `Currency mismatch: entity currency '${normA}' does not match expected reporting currency '${normB}'${msg}. Multi-currency summation is strictly prohibited.`
    );
  }
}
