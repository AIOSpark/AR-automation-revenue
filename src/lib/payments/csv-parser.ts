// AIOSpark Bank Statement Payment CSV Parser & Monetary Unit Validation Engine
// Enforces RFC 4180 parsing, header-based mapping, explicit monetary unit resolution,
// and comprehensive row-level validation (no silent discarding of records).

export interface PaymentCSVRowError {
  row: number; // 1-based row number in the CSV (including header)
  field: string;
  value: string;
  message: string;
}

export interface ParsedPaymentRow {
  date: string; // ISO format: YYYY-MM-DD
  reference: string;
  narration: string;
  amountMajorUnits: number; // In INR (Rupees), stored as absolute magnitude
  amountMinorUnits: number; // In Paise (integer minor units), stored as absolute magnitude
  currency: string; // 'INR'
  direction: 'credit' | 'debit'; // Transaction direction: incoming (credit) or outgoing (debit)
  originalRowNumber: number;
}

export type MonetaryUnitType = 'INR_MAJOR' | 'PAISE_MINOR';

export interface PaymentCSVParseResult {
  success: boolean;
  rows: ParsedPaymentRow[];
  errors: PaymentCSVRowError[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  monetaryUnit: MonetaryUnitType;
}

/**
 * Splits an RFC 4180 CSV line into individual cell tokens.
 * Handles quoted fields, embedded commas, and escaped double quotes ("").
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped double quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quoted section
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        fields.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  fields.push(currentField.trim());
  return fields;
}

/**
 * Converts a string or number in INR (rupees / major units) to integer Paise (minor units).
 * Uses string manipulation of decimal places to prevent floating-point rounding inaccuracies.
 */
export function rupeesToPaise(val: number | string): { paise: number; hasExcessDecimals: boolean } {
  const cleanStr = String(val)
    .replace(/[₹\s,INR]/gi, '')
    .trim();

  if (!cleanStr) {
    return { paise: NaN, hasExcessDecimals: false };
  }

  const parts = cleanStr.split('.');
  if (parts.length > 2) {
    return { paise: NaN, hasExcessDecimals: false };
  }

  const integerPart = parts[0];
  const decimalPart = parts[1] || '';

  if (decimalPart.length > 2) {
    // Has fractional sub-paisa decimals
    const num = Number(cleanStr);
    return { paise: Math.round(num * 100), hasExcessDecimals: true };
  }

  const paddedDecimal = (decimalPart + '00').slice(0, 2);
  const isNegative = integerPart.startsWith('-');
  const absInteger = integerPart.replace('-', '') || '0';

  const paiseStr = `${absInteger}${paddedDecimal}`;
  const paiseNum = parseInt(paiseStr, 10);

  return {
    paise: isNegative ? -paiseNum : paiseNum,
    hasExcessDecimals: false,
  };
}

/**
 * Validates whether a date string is a real calendar date in YYYY-MM-DD format.
 */
export function isValidISODate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);

  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }

  const testDate = new Date(Date.UTC(y, m - 1, d));
  return (
    testDate.getUTCFullYear() === y &&
    testDate.getUTCMonth() === m - 1 &&
    testDate.getUTCDate() === d
  );
}

// Known header aliases for flexible column orders
const DATE_HEADERS = ['date', 'txn_date', 'transaction_date', 'value_date', 'posting_date'];
const REF_HEADERS = [
  'reference',
  'ref',
  'reference_no',
  'reference_number',
  'txn_id',
  'transaction_id',
  'utr',
  'cheque_no',
  'chq_no',
];
const NARRATION_HEADERS = [
  'narration',
  'description',
  'particulars',
  'remarks',
  'memo',
  'details',
  'notes',
];
const MAJOR_AMOUNT_HEADERS = [
  'amount',
  'amount_inr',
  'amount (inr)',
  'amount_rupees',
  'amount (rupees)',
  'credit',
  'credit_amount',
  'debit',
  'debit_amount',
  'deposit',
  'deposit_amount',
  'inr',
];
const MINOR_AMOUNT_HEADERS = [
  'amount_paise',
  'amount (paise)',
  'amount_minor_units',
  'amount (minor units)',
  'paise',
  'minor_units',
];

/**
 * Parses and validates raw bank statement payment CSV text with header-based mapping,
 * explicit monetary unit handling, and row-level validation.
 */
export function parsePaymentCSV(csvContent: string): PaymentCSVParseResult {
  const errors: PaymentCSVRowError[] = [];
  const rows: ParsedPaymentRow[] = [];

  const cleanContent = csvContent.replace(/^\uFEFF/, '').trim();
  if (!cleanContent) {
    return {
      success: false,
      rows: [],
      errors: [
        {
          row: 0,
          field: 'file',
          value: '',
          message: 'CSV content is empty. Provide a CSV with header and data rows.',
        },
      ],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      monetaryUnit: 'INR_MAJOR',
    };
  }

  const rawLines = cleanContent.split(/\r?\n/);
  if (rawLines.length < 2) {
    return {
      success: false,
      rows: [],
      errors: [
        {
          row: 1,
          field: 'header',
          value: cleanContent,
          message: 'CSV must contain a header row and at least one data row.',
        },
      ],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      monetaryUnit: 'INR_MAJOR',
    };
  }

  // Header parsing
  const headerTokens = parseCSVLine(rawLines[0]).map((h) =>
    h.toLowerCase().replace(/['"]/g, '').trim()
  );

  const findColIndex = (aliases: string[]) =>
    headerTokens.findIndex((h) => aliases.includes(h));

  const dateIdx = findColIndex(DATE_HEADERS);
  const refIdx = findColIndex(REF_HEADERS);
  const narrationIdx = findColIndex(NARRATION_HEADERS);
  const majorAmtIdx = findColIndex(MAJOR_AMOUNT_HEADERS);
  const minorAmtIdx = findColIndex(MINOR_AMOUNT_HEADERS);

  // Check for ambiguous or conflicting amount columns
  if (majorAmtIdx !== -1 && minorAmtIdx !== -1) {
    return {
      success: false,
      rows: [],
      errors: [
        {
          row: 1,
          field: 'header',
          value: headerTokens.join(', '),
          message:
            'Ambiguous monetary units: CSV contains both major unit (INR) and minor unit (Paise) headers. Specify one amount column to prevent incorrect financial conversion.',
        },
      ],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      monetaryUnit: 'INR_MAJOR',
    };
  }

  const amountIdx = majorAmtIdx !== -1 ? majorAmtIdx : minorAmtIdx;
  const monetaryUnit: MonetaryUnitType =
    minorAmtIdx !== -1 ? 'PAISE_MINOR' : 'INR_MAJOR';

  // Check required columns
  const missingRequired: string[] = [];
  if (dateIdx === -1) missingRequired.push('date (e.g. "date" or "txn_date")');
  if (refIdx === -1) missingRequired.push('reference (e.g. "reference" or "utr")');
  if (amountIdx === -1)
    missingRequired.push(
      'amount (e.g. "amount" in INR or "amount_paise" in Paise)'
    );

  if (missingRequired.length > 0) {
    return {
      success: false,
      rows: [],
      errors: [
        {
          row: 1,
          field: 'header',
          value: headerTokens.join(', '),
          message: `Missing required column(s): ${missingRequired.join(', ')}. Found headers: [${headerTokens.join(', ')}]`,
        },
      ],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      monetaryUnit,
    };
  }

  const seenReferences = new Map<string, number>();
  let totalDataRows = 0;

  for (let lineIndex = 1; lineIndex < rawLines.length; lineIndex++) {
    const rawLine = rawLines[lineIndex].trim();
    if (!rawLine) continue; // Skip blank lines safely

    totalDataRows++;
    const rowNum = lineIndex + 1; // 1-based line number in CSV
    const fields = parseCSVLine(rawLine);

    const getField = (idx: number) => (idx !== -1 && idx < fields.length ? fields[idx].trim() : '');

    const rawDate = getField(dateIdx);
    const rawRef = getField(refIdx);
    const rawNarration = narrationIdx !== -1 ? getField(narrationIdx) : '';
    const rawAmount = getField(amountIdx);

    let rowHasError = false;

    // 1. Date validation
    if (!rawDate) {
      errors.push({
        row: rowNum,
        field: 'date',
        value: '',
        message: 'Date is required.',
      });
      rowHasError = true;
    } else if (!isValidISODate(rawDate)) {
      errors.push({
        row: rowNum,
        field: 'date',
        value: rawDate,
        message: 'Invalid date format or value. Expected valid calendar date in YYYY-MM-DD format.',
      });
      rowHasError = true;
    }

    // 2. Reference validation
    if (!rawRef) {
      errors.push({
        row: rowNum,
        field: 'reference',
        value: '',
        message: 'Reference is required.',
      });
      rowHasError = true;
    } else {
      const normalizedRef = rawRef.toUpperCase();
      if (seenReferences.has(normalizedRef)) {
        errors.push({
          row: rowNum,
          field: 'reference',
          value: rawRef,
          message: `Duplicate reference '${rawRef}' detected in upload (first seen at row ${seenReferences.get(normalizedRef)}).`,
        });
        rowHasError = true;
      } else {
        seenReferences.set(normalizedRef, rowNum);
      }
    }

    // 3. Amount validation & monetary conversion
    if (!rawAmount) {
      errors.push({
        row: rowNum,
        field: 'amount',
        value: '',
        message: 'Amount is required.',
      });
      rowHasError = true;
    } else {
      const cleanedAmountStr = rawAmount.replace(/[₹\s,INR]/gi, '');
      const parsedNum = Number(cleanedAmountStr);

      if (isNaN(parsedNum) || cleanedAmountStr === '') {
        errors.push({
          row: rowNum,
          field: 'amount',
          value: rawAmount,
          message: 'Invalid amount. Expected a numeric value.',
        });
        rowHasError = true;
      } else if (!Number.isFinite(parsedNum)) {
        errors.push({
          row: rowNum,
          field: 'amount',
          value: rawAmount,
          message: 'Amount must be a finite number.',
        });
        rowHasError = true;
      } else if (parsedNum === 0) {
        errors.push({
          row: rowNum,
          field: 'amount',
          value: rawAmount,
          message: 'Amount cannot be zero. Financial transactions must have a non-zero value.',
        });
        rowHasError = true;
      } else {
        const isDebit = parsedNum < 0;
        const absNum = Math.abs(parsedNum);
        const direction: 'credit' | 'debit' = isDebit ? 'debit' : 'credit';

        let amountMinorUnits: number;
        let amountMajorUnits: number;

        if (monetaryUnit === 'PAISE_MINOR') {
          // Explicit minor units (Paise)
          if (!Number.isInteger(absNum)) {
            errors.push({
              row: rowNum,
              field: 'amount',
              value: rawAmount,
              message: 'Minor units (Paise) must be an integer. Fractional sub-paise amounts are not permitted.',
            });
            rowHasError = true;
            amountMinorUnits = 0;
            amountMajorUnits = 0;
          } else {
            amountMinorUnits = absNum;
            amountMajorUnits = absNum / 100;
          }
        } else {
          // Major units (INR)
          const { paise, hasExcessDecimals } = rupeesToPaise(String(absNum));

          if (hasExcessDecimals) {
            errors.push({
              row: rowNum,
              field: 'amount',
              value: rawAmount,
              message: 'Amount cannot have more than 2 decimal places in INR (major units).',
            });
            rowHasError = true;
            amountMinorUnits = 0;
            amountMajorUnits = 0;
          } else {
            amountMinorUnits = Math.abs(paise);
            amountMajorUnits = absNum;
          }
        }

        // Check for safe integer overflow (> 100 Crore rupees = 100,000,000,000 paise)
        if (!rowHasError && amountMinorUnits > Number.MAX_SAFE_INTEGER) {
          errors.push({
            row: rowNum,
            field: 'amount',
            value: rawAmount,
            message: 'Amount exceeds maximum supported numeric limits.',
          });
          rowHasError = true;
        }

        if (!rowHasError) {
          rows.push({
            date: rawDate,
            reference: rawRef,
            narration: rawNarration || (direction === 'debit' ? 'NEFT Debit Transaction' : 'NEFT Credit Payment'),
            amountMajorUnits,
            amountMinorUnits,
            currency: 'INR',
            direction,
            originalRowNumber: rowNum,
          });
        }
      }
    }
  }

  const validRows = rows.length;
  const invalidRows = errors.length > 0 ? totalDataRows - validRows : 0;
  const success = errors.length === 0 && validRows > 0;

  return {
    success,
    rows,
    errors,
    totalRows: totalDataRows,
    validRows,
    invalidRows,
    monetaryUnit,
  };
}
