// AIOSpark Exact Monetary Parser (GAP-F2 & GAP-F3)
// Eliminates floating-point conversion; enforces exact decimal arithmetic, locale-aware parsing,
// accounting negative notation, safe integer bounds, and strict precision policies.

import { getCurrencyDefinition, isValidCurrencyCode } from './currency';

export type NumberFormatConvention = 'indian' | 'standard' | 'european' | 'auto_strict';

export interface MonetaryParseOptions {
  currency?: string;                    // Target currency, default 'INR'
  locale?: string;                      // e.g. 'en-IN', 'en-US', 'de-DE'
  numberFormat?: NumberFormatConvention;// 'indian' | 'standard' | 'european' | 'auto_strict'
  allowNegative?: boolean;              // Default true
  allowZero?: boolean;                  // Default true
  maxMinorUnits?: number;               // Default Number.MAX_SAFE_INTEGER
  minMinorUnits?: number;               // Default -Number.MAX_SAFE_INTEGER or 0 if !allowNegative
}

export type MonetaryErrorCode =
  | 'EMPTY_INPUT'
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_PRECISION'
  | 'INTEGER_OVERFLOW'
  | 'NEGATIVE_NOT_ALLOWED'
  | 'ZERO_NOT_ALLOWED'
  | 'AMBIGUOUS_FORMAT'
  | 'UNSUPPORTED_CURRENCY'
  | 'CURRENCY_MISMATCH';

export interface MonetaryParseSuccess {
  success: true;
  minorUnits: number;
  currency: string;
  isNegative: boolean;
  rawInput: string;
  normalizedMajorUnits: string;
}

export interface MonetaryParseFailure {
  success: false;
  rawInput: string;
  error: string;
  code: MonetaryErrorCode;
}

export type MonetaryParseResult = MonetaryParseSuccess | MonetaryParseFailure;

// Known currency symbols and prefixes
const CURRENCY_SYMBOLS: Record<string, string> = {
  '₹': 'INR',
  'RS.': 'INR',
  'RS': 'INR',
  'INR': 'INR',
  '$': 'USD',
  'USD': 'USD',
  '€': 'EUR',
  'EUR': 'EUR',
  '£': 'GBP',
  'GBP': 'GBP',
  'AED': 'AED',
  'S$': 'SGD',
  'SGD': 'SGD',
  '¥': 'JPY',
  'JPY': 'JPY',
};

/**
 * Parses monetary input with accounting-grade precision and zero floating-point arithmetic.
 */
export function parseMonetaryAmount(
  rawInput: unknown,
  options?: MonetaryParseOptions
): MonetaryParseResult {
  if (rawInput === null || rawInput === undefined) {
    return {
      success: false,
      rawInput: String(rawInput),
      error: 'Monetary input is null or undefined',
      code: 'EMPTY_INPUT',
    };
  }

  const rawStr = String(rawInput).trim();
  if (rawStr === '') {
    return {
      success: false,
      rawInput: rawStr,
      error: 'Monetary input is empty',
      code: 'EMPTY_INPUT',
    };
  }

  const explicitCurrencyProvided = Boolean(options?.currency);
  let configuredCurrency = (options?.currency || 'INR').trim().toUpperCase();
  if (!isValidCurrencyCode(configuredCurrency)) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Configured currency '${configuredCurrency}' is not a valid ISO 4217 code`,
      code: 'UNSUPPORTED_CURRENCY',
    };
  }

  // 1. Check Accounting Negatives: (1,000.00) or (₹1,000.00)
  let isNegative = false;
  let workStr = rawStr;

  const parenMatch = workStr.match(/^\s*\((.*)\)\s*$/);
  if (parenMatch) {
    isNegative = true;
    workStr = parenMatch[1].trim();
  } else if (workStr.startsWith('-')) {
    isNegative = true;
    workStr = workStr.substring(1).trim();
  }

  // Check for misplaced negative signs
  if (workStr.includes('-') || workStr.includes('(') || workStr.includes(')')) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Invalid negative number formatting in '${rawStr}'`,
      code: 'INVALID_FORMAT',
    };
  }

  // 2. Currency Symbol / Prefix / Suffix Detection
  let detectedCurrency: string | null = null;

  // Check prefix currency symbols (e.g. ₹, $, €, £, Rs, USD, INR)
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    const upperWork = workStr.toUpperCase();
    if (upperWork.startsWith(sym)) {
      detectedCurrency = code;
      workStr = workStr.substring(sym.length).trim();
      break;
    } else if (upperWork.endsWith(sym)) {
      detectedCurrency = code;
      workStr = workStr.substring(0, workStr.length - sym.length).trim();
      break;
    }
  }

  // If detected currency contradicts configured currency, reject currency mismatch
  if (detectedCurrency) {
    if (explicitCurrencyProvided && detectedCurrency !== configuredCurrency) {
      return {
        success: false,
        rawInput: rawStr,
        error: `Currency mismatch: input contains symbol for '${detectedCurrency}', but expected currency is '${configuredCurrency}'`,
        code: 'CURRENCY_MISMATCH',
      };
    }
    // If currency was not explicitly provided by options, adopt detected currency
    configuredCurrency = detectedCurrency;
  }

  const currencyDef = getCurrencyDefinition(configuredCurrency);
  const maxDecimals = currencyDef.minorUnitDigits;

  // 3. Multiplier Notation (Lakh, Crore, K, M)
  let multiplierMinorUnits = 1; // Factor to multiply by
  let hasMultiplier = false;

  const lowerWork = workStr.toLowerCase();
  if (/\b(lakhs?|l)\b$/i.test(lowerWork) || /l$/i.test(lowerWork)) {
    hasMultiplier = true;
    multiplierMinorUnits = 100000;
    workStr = workStr.replace(/\s*(lakhs?|l)$/i, '').trim();
  } else if (/\b(crores?|cr)\b$/i.test(lowerWork) || /cr$/i.test(lowerWork)) {
    hasMultiplier = true;
    multiplierMinorUnits = 10000000;
    workStr = workStr.replace(/\s*(crores?|cr)$/i, '').trim();
  } else if (/\bk\b$/i.test(lowerWork)) {
    hasMultiplier = true;
    multiplierMinorUnits = 1000;
    workStr = workStr.replace(/\s*k$/i, '').trim();
  } else if (/\bm\b$/i.test(lowerWork)) {
    hasMultiplier = true;
    multiplierMinorUnits = 1000000;
    workStr = workStr.replace(/\s*m$/i, '').trim();
  }

  // 4. Resolve Locale and Separator Convention
  // Convention determination:
  // - European: decimal separator is comma (,), grouping is dot (.) or space ( )
  // - Standard / Indian: decimal separator is dot (.), grouping is comma (,) or space ( )
  let convention: NumberFormatConvention = options?.numberFormat || 'indian';

  if (!options?.numberFormat) {
    if (options?.locale?.startsWith('de') || options?.locale?.startsWith('fr') || options?.locale?.startsWith('es') || options?.locale?.startsWith('it')) {
      convention = 'european';
    } else if (options?.locale === 'en-US' || options?.locale === 'en-GB') {
      convention = 'standard';
    } else {
      // Default to Indian/Standard
      convention = 'indian';
    }
  }

  let decimalSep = '.';
  let groupingSep = ',';

  if (convention === 'european') {
    decimalSep = ',';
    groupingSep = '.';
  }

  // Check for ambiguous or mismatched separators
  const hasComma = workStr.includes(',');
  const hasDot = workStr.includes('.');

  // If in Indian/Standard mode but input has 1.234,56 (dot before comma), that's European notation
  if (convention !== 'european' && hasComma && hasDot) {
    const firstComma = workStr.indexOf(',');
    const lastComma = workStr.lastIndexOf(',');
    const firstDot = workStr.indexOf('.');
    const lastDot = workStr.lastIndexOf('.');

    if (firstDot < firstComma) {
      // Dot appears before comma -> European notation in an Indian/Standard locale
      return {
        success: false,
        rawInput: rawStr,
        error: `Mismatched number format: '${rawStr}' uses European decimal format (comma decimal with dot thousands), which is not permitted under the configured locale '${options?.locale || 'en-IN'}'. Configure European locale to parse.`,
        code: 'AMBIGUOUS_FORMAT',
      };
    }
  }

  // If in European mode but input has 1,234.56 (comma before dot), reject
  if (convention === 'european' && hasComma && hasDot) {
    const firstComma = workStr.indexOf(',');
    const firstDot = workStr.indexOf('.');
    if (firstComma < firstDot) {
      return {
        success: false,
        rawInput: rawStr,
        error: `Mismatched number format: '${rawStr}' uses standard/Indian decimal format (dot decimal), which contradicts European locale.`,
        code: 'AMBIGUOUS_FORMAT',
      };
    }
  }

  // 5. Split Integer and Fractional Parts
  const parts = workStr.split(decimalSep);
  if (parts.length > 2) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Invalid number format: '${rawStr}' contains multiple decimal separators '${decimalSep}'`,
      code: 'INVALID_FORMAT',
    };
  }

  const intPartRaw = parts[0];
  const fracPartRaw = parts.length === 2 ? parts[1] : '';

  // Validate integer part characters
  // May only contain digits, spaces, and the grouping separator
  const validIntCharsRegex = new RegExp(`^[0-9\\s\\${groupingSep}]*$`);
  if (!validIntCharsRegex.test(intPartRaw)) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Invalid characters in integer part of '${rawStr}'`,
      code: 'INVALID_FORMAT',
    };
  }

  // Clean integer part by removing grouping separators and spaces
  const cleanIntStr = intPartRaw.replace(new RegExp(`[\\s\\${groupingSep}]`, 'g'), '');
  if (cleanIntStr === '' && fracPartRaw === '') {
    return {
      success: false,
      rawInput: rawStr,
      error: `Number in '${rawStr}' contains no digits`,
      code: 'INVALID_FORMAT',
    };
  }

  // Validate fractional part characters
  if (fracPartRaw !== '') {
    if (!/^[0-9]+$/.test(fracPartRaw)) {
      return {
        success: false,
        rawInput: rawStr,
        error: `Invalid characters in fractional part of '${rawStr}'`,
        code: 'INVALID_FORMAT',
      };
    }
  }

  // 6. Strict Precision Verification
  // When no multiplier is applied, fractional length cannot exceed currency maxDecimals
  if (!hasMultiplier) {
    if (fracPartRaw.length > maxDecimals) {
      return {
        success: false,
        rawInput: rawStr,
        error: `Unsupported precision: '${rawStr}' has ${fracPartRaw.length} decimal places, but ${configuredCurrency} supports only ${maxDecimals} minor-unit decimal places. Precision rounding is not permitted.`,
        code: 'UNSUPPORTED_PRECISION',
      };
    }
  }

  // 7. Exact Integer Minor Units Calculation
  let minorUnitsBigInt: bigint;

  if (hasMultiplier) {
    // Exact scaling for multiplier (e.g. 1.5 Lakh = 1.5 * 100000 = 150000 * 100 paise)
    // Avoid float: parse as integer minor units of major unit, then scale
    const fracLength = fracPartRaw.length;
    const combinedDigits = (cleanIntStr || '0') + fracPartRaw;
    const baseValue = BigInt(combinedDigits);
    const scaleFactor = BigInt(10 ** fracLength);
    // Multiplied minor units = baseValue * multiplierMinorUnits * (10 ** maxDecimals) / scaleFactor
    const totalMinorUnitsMultiplier = BigInt(multiplierMinorUnits) * BigInt(10 ** maxDecimals);
    const numerator = baseValue * totalMinorUnitsMultiplier;
    if (numerator % scaleFactor !== BigInt(0)) {
      return {
        success: false,
        rawInput: rawStr,
        error: `Multiplier value '${rawStr}' results in non-integer minor units (${configuredCurrency} paise).`,
        code: 'UNSUPPORTED_PRECISION',
      };
    }
    minorUnitsBigInt = numerator / scaleFactor;
  } else {
    // Standard minor units conversion:
    // Pad fraction with zeros up to maxDecimals
    const paddedFrac = fracPartRaw.padEnd(maxDecimals, '0');
    const combinedStr = (cleanIntStr || '0') + paddedFrac;
    minorUnitsBigInt = BigInt(combinedStr);
  }

  if (isNegative) {
    minorUnitsBigInt = -minorUnitsBigInt;
  }

  // 8. Safe Integer Validation
  if (
    minorUnitsBigInt > BigInt(Number.MAX_SAFE_INTEGER) ||
    minorUnitsBigInt < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Amount '${rawStr}' exceeds JavaScript safe integer bounds [${Number.MIN_SAFE_INTEGER}, ${Number.MAX_SAFE_INTEGER}]`,
      code: 'INTEGER_OVERFLOW',
    };
  }

  const minorUnits = Number(minorUnitsBigInt);

  // 9. Negative & Zero Boundary Policy
  if (options?.allowNegative === false && minorUnits < 0) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Negative amounts are not permitted: '${rawStr}'`,
      code: 'NEGATIVE_NOT_ALLOWED',
    };
  }

  if (options?.allowZero === false && minorUnits === 0) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Zero amounts are not permitted: '${rawStr}'`,
      code: 'ZERO_NOT_ALLOWED',
    };
  }

  if (options?.maxMinorUnits !== undefined && minorUnits > options.maxMinorUnits) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Amount '${rawStr}' (${minorUnits} minor units) exceeds maximum allowed ${options.maxMinorUnits}`,
      code: 'INTEGER_OVERFLOW',
    };
  }

  if (options?.minMinorUnits !== undefined && minorUnits < options.minMinorUnits) {
    return {
      success: false,
      rawInput: rawStr,
      error: `Amount '${rawStr}' (${minorUnits} minor units) is below minimum allowed ${options.minMinorUnits}`,
      code: 'INTEGER_OVERFLOW',
    };
  }

  // Normalized major units string for UI and audit logs
  const absMinorUnits = Math.abs(minorUnits);
  const majorPart = Math.floor(absMinorUnits / (10 ** maxDecimals));
  const minorPart = (absMinorUnits % (10 ** maxDecimals)).toString().padStart(maxDecimals, '0');
  const normalizedMajorUnits = `${isNegative ? '-' : ''}${majorPart}${maxDecimals > 0 ? '.' + minorPart : ''}`;

  return {
    success: true,
    minorUnits,
    currency: configuredCurrency,
    isNegative,
    rawInput: rawStr,
    normalizedMajorUnits,
  };
}

/**
 * Strict helper that throws on parse failure, returning exact integer minor units.
 */
export function parseMonetaryAmountOrThrow(
  rawInput: unknown,
  options?: MonetaryParseOptions
): number {
  const result = parseMonetaryAmount(rawInput, options);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.minorUnits;
}

/**
 * Converts a numeric value (major units, e.g. rupees) to exact integer minor units
 * (e.g. paise) without floating-point arithmetic.
 *
 * Handles the case where adapters receive already-typed numbers from ERP/bank APIs
 * rather than locale-formatted strings. Uses BigInt multiplication to avoid
 * IEEE-754 representation error (e.g. 1800000.01 * 100 != 180000001 in float).
 *
 * @param value - Major unit amount (e.g. 1800000.50 for ₹18,00,000.50)
 * @param currency - ISO 4217 currency code (default 'INR')
 * @returns Exact minor units or failure with error code
 */
export function convertMajorUnitsToMinorUnits(
  value: number,
  options?: { currency?: string; allowNegative?: boolean }
): MonetaryParseResult {
  if (!Number.isFinite(value)) {
    return {
      success: false,
      rawInput: String(value),
      error: `Amount is not a finite number: ${value}`,
      code: 'INVALID_FORMAT',
    };
  }

  const currency = (options?.currency || 'INR').trim().toUpperCase();
  if (!isValidCurrencyCode(currency)) {
    return {
      success: false,
      rawInput: String(value),
      error: `Unsupported currency code '${currency}'`,
      code: 'UNSUPPORTED_CURRENCY',
    };
  }

  const currencyDef = getCurrencyDefinition(currency);
  const maxDecimals = currencyDef.minorUnitDigits;

  // Split into integer and fractional parts using string representation
  // to avoid floating-point multiplication error.
  const absValue = Math.abs(value);
  const str = absValue.toString();
  const [intPartStr, fracPartStr = ''] = str.split('.');

  const intBigInt = BigInt(intPartStr || '0');

  // Scale integer part to minor units: intPart * 10^maxDecimals
  let minorUnitsBigInt = intBigInt * BigInt(10 ** maxDecimals);

  // Add fractional part padded/truncated to maxDecimals
  if (fracPartStr.length > 0) {
    const fracPadded = fracPartStr.padEnd(maxDecimals, '0').slice(0, maxDecimals);
    if (fracPadded.length > 0) {
      minorUnitsBigInt = minorUnitsBigInt + BigInt(fracPadded);
    }
  }

  // Check for excess precision beyond currency minor unit digits
  const fracExcess = fracPartStr.length > maxDecimals;
  if (fracExcess) {
    return {
      success: false,
      rawInput: String(value),
      error: `Unsupported precision: value '${value}' has more than ${maxDecimals} decimal places for ${currency}`,
      code: 'UNSUPPORTED_PRECISION',
    };
  }

  if (value < 0) {
    if (options?.allowNegative !== true) {
      return {
        success: false,
        rawInput: String(value),
        error: `Negative amounts are not permitted: ${value}`,
        code: 'NEGATIVE_NOT_ALLOWED',
      };
    }
    minorUnitsBigInt = -minorUnitsBigInt;
  }

  // Safe integer bounds check
  if (
    minorUnitsBigInt > BigInt(Number.MAX_SAFE_INTEGER) ||
    minorUnitsBigInt < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return {
      success: false,
      rawInput: String(value),
      error: `Amount '${value}' exceeds JavaScript safe integer bounds`,
      code: 'INTEGER_OVERFLOW',
    };
  }

  const minorUnits = Number(minorUnitsBigInt);
  return {
    success: true,
    minorUnits,
    currency,
    isNegative: minorUnits < 0,
    rawInput: String(value),
    normalizedMajorUnits: (minorUnits / (10 ** maxDecimals)).toFixed(maxDecimals),
  };
}

/**
 * Calculates tax minor units from a subtotal in minor units using exact
 * integer/rational arithmetic with an explicit documented rounding policy.
 *
 * Rounding policy: round half away from zero (commercial rounding).
 * Formula: tax = (subtotal * ratePercent) / 100, rounded to nearest minor unit.
 *
 * @param subtotalMinorUnits - Subtotal in minor units (e.g. paise)
 * @param ratePercent - Tax rate as a percentage (e.g. 9 for 9%, 18 for 18%)
 * @returns Exact tax minor units
 */
export function calculateTaxMinorUnits(
  subtotalMinorUnits: number,
  ratePercent: number
): number {
  if (!Number.isSafeInteger(subtotalMinorUnits)) {
    throw new Error(`Subtotal must be a safe integer: ${subtotalMinorUnits}`);
  }
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new Error(`Tax rate must be a finite percentage between 0 and 100: ${ratePercent}`);
  }

  // Exact rational arithmetic: tax = subtotal * rate / 100
  // Use BigInt to avoid floating-point error, round half away from zero.
  const subtotalBigInt = BigInt(subtotalMinorUnits);
  const rateBigInt = BigInt(Math.round(ratePercent * 100)); // rate in basis points (e.g. 9% = 900bps)
  // tax = subtotal * rate_bps / 10000
  const numerator = subtotalBigInt * rateBigInt;
  const denominator = BigInt(10000);

  // Round half away from zero
  const absNumerator = numerator < 0 ? -numerator : numerator;
  const quotient = absNumerator / denominator;
  const remainder = absNumerator % denominator;
  const twiceRemainder = remainder * BigInt(2);
  let rounded = quotient;
  if (twiceRemainder >= denominator) {
    rounded = quotient + BigInt(1);
  }
  const taxBigInt = numerator < 0 ? -rounded : rounded;

  if (
    taxBigInt > BigInt(Number.MAX_SAFE_INTEGER) ||
    taxBigInt < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(`Tax calculation exceeds safe integer bounds`);
  }

  return Number(taxBigInt);
}
