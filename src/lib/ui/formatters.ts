// AIOSpark Centralized Number, Currency, Date, and Percentage Formatting Utilities (Layer 36 UI Pass)

/**
 * Format currency minor units (e.g. Paise/Cents) to human-readable string with currency symbol.
 * Default locale 'en-IN' for INR (₹).
 */
export function formatCurrency(
  amountMinorUnits: number | null | undefined,
  currency: string = 'INR',
  locale: string = 'en-IN'
): string {
  if (amountMinorUnits == null || isNaN(amountMinorUnits)) {
    return '₹0';
  }

  const majorUnits = amountMinorUnits / 100;
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;

  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(majorUnits);
    return `${symbol}${formatted}`;
  } catch {
    return `${symbol}${majorUnits.toLocaleString()}`;
  }
}

/**
 * Format ISO date string into standard YYYY-MM-DD or readable date string.
 */
export function formatDate(dateStr: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    if (style === 'long') {
      return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return d.toISOString().substring(0, 10);
  } catch {
    return dateStr;
  }
}

/**
 * Format decimal (e.g. 0.854) to percentage string ("85.4%").
 */
export function formatPercent(value: number | null | undefined, decimals: number = 1): string {
  if (value == null || isNaN(value)) return '0%';
  const pct = value <= 1.0 && value >= 0 ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}
