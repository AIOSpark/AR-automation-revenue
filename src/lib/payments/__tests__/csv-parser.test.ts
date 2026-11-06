// AIOSpark Payment CSV Parser & Monetary Unit Handling Test Suite
import assert from 'assert';
import { parsePaymentCSV, parseCSVLine, rupeesToPaise, isValidISODate } from '../csv-parser';

export async function runPaymentCSVTestSuite(): Promise<{ passed: number; failed: number; errors: string[] }> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function test(name: string, fn: () => void) {
    try {
      fn();
      passed++;
    } catch (err: any) {
      failed++;
      errors.push(`${name}: ${err.message}`);
    }
  }

  // 1. RFC 4180 CSV Tokenizer Tests
  test('1a. CSV Tokenizer: handles simple comma separation', () => {
    const tokens = parseCSVLine('date,reference,amount,narration');
    assert.deepStrictEqual(tokens, ['date', 'reference', 'amount', 'narration']);
  });

  test('1b. CSV Tokenizer: handles quoted fields with embedded commas', () => {
    const tokens = parseCSVLine('2026-09-01,TXN-001,15000.00,"Payment from Gotham, Inc."');
    assert.deepStrictEqual(tokens, ['2026-09-01', 'TXN-001', '15000.00', 'Payment from Gotham, Inc.']);
  });

  test('1c. CSV Tokenizer: handles escaped double quotes ("")', () => {
    const tokens = parseCSVLine('2026-09-01,TXN-002,20000.00,"Acme ""Global"" Services"');
    assert.deepStrictEqual(tokens, ['2026-09-01', 'TXN-002', '20000.00', 'Acme "Global" Services']);
  });

  // 2. ISODate Validation Tests
  test('2a. Date Validation: accepts valid YYYY-MM-DD calendar dates', () => {
    assert.strictEqual(isValidISODate('2026-09-15'), true);
    assert.strictEqual(isValidISODate('2024-02-29'), true); // Leap year valid
  });

  test('2b. Date Validation: rejects non-existent calendar dates', () => {
    assert.strictEqual(isValidISODate('2026-02-29'), false); // 2026 is not a leap year
    assert.strictEqual(isValidISODate('2026-02-31'), false);
    assert.strictEqual(isValidISODate('2026-04-31'), false); // April has 30 days
    assert.strictEqual(isValidISODate('2026-13-01'), false); // Month 13
    assert.strictEqual(isValidISODate('15-09-2026'), false); // Wrong format
  });

  // 3. Monetary Unit Conversion (rupeesToPaise) Tests
  test('3a. Monetary Units: exact decimal conversion to minor units (Paise)', () => {
    assert.strictEqual(rupeesToPaise('12000.50').paise, 1200050);
    assert.strictEqual(rupeesToPaise('12000.5').paise, 1200050);
    assert.strictEqual(rupeesToPaise('12000.05').paise, 1200005);
    assert.strictEqual(rupeesToPaise('50000').paise, 5000000);
  });

  test('3b. Monetary Units: strips currency symbols and commas without floating point error', () => {
    assert.strictEqual(rupeesToPaise('₹1,50,000.00').paise, 15000000);
    assert.strictEqual(rupeesToPaise('INR 25,00,000.50').paise, 250000050);
  });

  test('3c. Monetary Units: detects sub-paisa excess decimals (>2 decimal places)', () => {
    const res = rupeesToPaise('12000.555');
    assert.strictEqual(res.hasExcessDecimals, true);
  });

  // 4. Header-Based Parsing & Column Order Tests
  test('4a. Header Mapping: handles arbitrary column orders', () => {
    const csv = [
      'amount,narration,date,reference',
      '15000.00,Client Advance,2026-09-01,TXN-ORDER-1',
      '25000.50,Invoice Payment,2026-09-02,TXN-ORDER-2',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(result.rows[0].reference, 'TXN-ORDER-1');
    assert.strictEqual(result.rows[0].amountMinorUnits, 1500000);
    assert.strictEqual(result.rows[0].date, '2026-09-01');
    assert.strictEqual(result.rows[1].amountMinorUnits, 2500050);
  });

  test('4b. Header Mapping: handles alias headers (utr, credit, posting_date, particulars)', () => {
    const csv = [
      'posting_date,utr,credit,particulars',
      '2026-09-05,UTR987654321,84000.00,RTGS Inward from Reliance',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].reference, 'UTR987654321');
    assert.strictEqual(result.rows[0].date, '2026-09-05');
    assert.strictEqual(result.rows[0].amountMinorUnits, 8400000);
    assert.strictEqual(result.rows[0].narration, 'RTGS Inward from Reliance');
  });

  // 5. Explicit Monetary Unit Resolution & No Double Conversion
  test('5a. Explicit Minor Units (amount_paise): preserves integer paise without double conversion', () => {
    const csv = [
      'date,reference,narration,amount_paise',
      '2026-09-10,TXN-PAISE-1,Direct Ledger Ingest,15000000',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.monetaryUnit, 'PAISE_MINOR');
    assert.strictEqual(result.rows[0].amountMinorUnits, 15000000); // 1.5 Lakhs in paise
    assert.strictEqual(result.rows[0].amountMajorUnits, 150000.0);
  });

  test('5b. Ambiguity Guard: rejects CSV when both major and minor amount headers are present', () => {
    const csv = [
      'date,reference,amount,amount_paise',
      '2026-09-10,TXN-AMBIG,1500.00,150000',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errors.length, 1);
    assert(result.errors[0].message.includes('Ambiguous monetary units'));
  });

  // 6. Financial Boundary Validations (Decimals, Zero, Negative, Large Amounts)
  test('6a. Amount Validation: rejects zero amount', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-11,TXN-ZERO,0.00,Zero Value Test',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, false);
    assert(result.errors.some((e) => e.field === 'amount' && e.message.includes('zero')));
  });

  test('6b. Amount Validation: accepts negative amounts as debits with direction flag', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-11,TXN-DEBIT,-5000.00,Vendor Debit',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].reference, 'TXN-DEBIT');
    assert.strictEqual(result.rows[0].direction, 'debit');
    assert.strictEqual(result.rows[0].amountMinorUnits, 500000); // absolute magnitude
    assert.strictEqual(result.rows[0].amountMajorUnits, 5000.0);
  });

  test('6c. Amount Validation: accepts positive amounts as credits with direction flag', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-11,TXN-CREDIT,12000.00,Customer Payment',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].direction, 'credit');
    assert.strictEqual(result.rows[0].amountMinorUnits, 1200000);
  });

  test('6d. Amount Validation: mixed credits and debits in one CSV are both accepted and distinguishable', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-11,TXN-IN-1,10000.00,Incoming Customer Payment',
      '2026-09-12,TXN-OUT-1,-3000.00,Outgoing Vendor Payment',
      '2026-09-13,TXN-IN-2,5000.00,Another Customer Receipt',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.rows.length, 3);
    assert.strictEqual(result.rows[0].direction, 'credit');
    assert.strictEqual(result.rows[1].direction, 'debit');
    assert.strictEqual(result.rows[2].direction, 'credit');
    assert.strictEqual(result.rows[0].amountMinorUnits, 1000000);
    assert.strictEqual(result.rows[1].amountMinorUnits, 300000);
    assert.strictEqual(result.rows[2].amountMinorUnits, 500000);
  });

  test('6e. Amount Validation: rejects sub-paisa decimals (>2 decimal places)', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-11,TXN-DEC,12000.555,Excess Precision Test',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, false);
    assert(result.errors.some((e) => e.field === 'amount' && e.message.includes('more than 2 decimal places')));
  });

  test('6f. Amount Validation: accurately handles large amounts (50 Crores)', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-11,TXN-LARGE,500000000.00,50 Crore Corporate Settlement',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.rows[0].amountMinorUnits, 50000000000); // 50 billion paise
    assert.strictEqual(result.rows[0].amountMajorUnits, 500000000);
  });

  // 7. Duplicate Reference & Row-Level Error Tracking
  test('7a. Duplicate Reference: catches duplicates and does not silently drop them', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-01,TXN-DUP-01,10000.00,First Payment',
      '2026-09-02,TXN-DUP-01,20000.00,Duplicate Reference Attempt',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].row, 3);
    assert(result.errors[0].message.includes('Duplicate reference'));
  });

  test('7b. Row-Level Errors: reports exact row and field without silently discarding', () => {
    const csv = [
      'date,reference,amount,narration',
      '2026-09-01,TXN-OK-1,10000.00,Valid Row',
      'invalid-date,TXN-ERR-1,20000.00,Bad Date',
      '2026-09-03,,30000.00,Missing Reference',
      '2026-09-04,TXN-ERR-3,not-a-number,Bad Amount',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errors.length, 3);
    assert.strictEqual(result.errors[0].row, 3);
    assert.strictEqual(result.errors[0].field, 'date');
    assert.strictEqual(result.errors[1].row, 4);
    assert.strictEqual(result.errors[1].field, 'reference');
    assert.strictEqual(result.errors[2].row, 5);
    assert.strictEqual(result.errors[2].field, 'amount');
  });

  test('7c. Required Columns: reports missing required header', () => {
    const csv = [
      'reference,amount,narration', // Missing date
      'TXN-NO-DATE,10000.00,Test',
    ].join('\n');

    const result = parsePaymentCSV(csv);
    assert.strictEqual(result.success, false);
    assert(result.errors[0].message.includes('Missing required column(s): date'));
  });

  return { passed, failed, errors };
}

// Standalone runner for direct CLI verification
if (require.main === module) {
  runPaymentCSVTestSuite().then((res) => {
    console.log(`Payment CSV Test Suite: ${res.passed} passed, ${res.failed} failed`);
    if (res.errors.length > 0) {
      console.error('Failures:\n' + res.errors.join('\n'));
      process.exit(1);
    }
  });
}
