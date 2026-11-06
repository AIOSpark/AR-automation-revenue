import fs from 'fs';
import { realPilotPipelineEngine } from '../src/lib/import/pilot-pipeline';
import { udmStore } from '../src/lib/udm/store';

async function testFullPilotWorkflow() {
  console.log('=====================================================');
  console.log('STARTING REAL CSV/XLSX DATA PILOT VALIDATION');
  console.log('=====================================================\n');

  const tenantA = 'org-pilot-tenant-a-real';
  const tenantB = 'org-control-tenant-b-empty';

  // 1. FILE VALIDATION & EXECUTIONS FOR TENANT A USING XLSX MASTER
  console.log('--> Testing XLSX Master Multi-Sheet Ingestion for Tenant A...');
  const xlsxBuffer = fs.readFileSync('./test-fixtures/pilot/pilot_master.xlsx');
  
  const valResult = realPilotPipelineEngine.parseAndValidateFile(xlsxBuffer, 'pilot_master.xlsx', xlsxBuffer.length);
  console.log('Validation Result:', { isValid: valResult.isValid, sheets: valResult.sheets.map(s => s.sheetName) });

  const sheetConfigs = valResult.sheets.map(sheet => {
    const colMap: Record<string, string> = {};
    sheet.mappings.forEach(m => {
      if (m.targetField !== 'IGNORE') {
        colMap[m.targetField] = m.sourceColumn;
      }
    });
    return {
      sheetName: sheet.sheetName,
      datasetType: sheet.detectedDataset,
      columnMapping: colMap
    };
  });

  const preview = realPilotPipelineEngine.generateImportPreview(tenantA, xlsxBuffer, sheetConfigs);
  console.log('Preview Result:', {
    totalRows: preview.totalRowsDetected,
    validRows: preview.validRowsCount,
    duplicates: preview.duplicateCount,
    errors: preview.errorCount
  });

  const executionResult = realPilotPipelineEngine.commitPilotImport(tenantA, xlsxBuffer, sheetConfigs, 'user-pilot-qa');
  console.log('Execution Result Tenant A:', executionResult.status, executionResult.importedCounts);

  // 2. CHECK TENANT A DATA IN UDM
  udmStore.setTenantContext(tenantA);
  const customersA = udmStore.getCustomers();
  const invoicesA = udmStore.getInvoices();
  const paymentsA = udmStore.getPayments();
  const exceptionsA = udmStore.getExceptions();
  const matchesA = udmStore.getMatches();

  console.log('\n--- TENANT A PERSISTED DATA ---');
  console.log('Customers Count:', customersA.length);
  console.log('Invoices Count:', invoicesA.length);
  console.log('Payments Count:', paymentsA.length);
  console.log('Exceptions Count:', exceptionsA.length);

  // Financial metrics check using exact UDM properties (amount_minor_units)
  const totalBilledMinor = invoicesA.reduce((acc, i) => acc + i.amount_minor_units, 0);
  const totalPaidMinor = paymentsA.reduce((acc, p) => acc + p.amount_minor_units, 0);
  const matchedSumMinor = matchesA.reduce((acc, m) => acc + m.matched_amount_minor_units, 0);
  const totalOutstandingMinor = Math.max(0, totalBilledMinor - matchedSumMinor);

  console.log('Total Billed (Paise):', totalBilledMinor, `(INR ${totalBilledMinor/100})`);
  console.log('Total Paid (Paise):', totalPaidMinor, `(INR ${totalPaidMinor/100})`);
  console.log('Total Outstanding (Paise):', totalOutstandingMinor, `(INR ${totalOutstandingMinor/100})`);

  // 3. CHECK CONTROL TENANT B IS 100% EMPTY
  udmStore.setTenantContext(tenantB);
  const customersB = udmStore.getCustomers();
  const invoicesB = udmStore.getInvoices();
  const paymentsB = udmStore.getPayments();

  console.log('\n--- CONTROL TENANT B DATA ---');
  console.log('Customers Count:', customersB.length);
  console.log('Invoices Count:', invoicesB.length);
  console.log('Payments Count:', paymentsB.length);

  // 4. TEST INDIVIDUAL CSV IMPORT
  console.log('\n--> Testing CSV Single File Ingestion for Customer CSV...');
  const csvBuffer = fs.readFileSync('./test-fixtures/pilot/customers.csv');
  const csvVal = realPilotPipelineEngine.parseAndValidateFile(csvBuffer, 'customers.csv', csvBuffer.length);
  console.log('CSV Detection:', csvVal.sheets[0].detectedDataset);

  // 5. TEST FILE VALIDATION ERROR MATRIX
  console.log('\n--> Testing File Validation Failure Cases...');
  const errorMatrix: { name: string; test: () => boolean }[] = [
    {
      name: '1. Empty File (0 bytes)',
      test: () => {
        const res = realPilotPipelineEngine.parseAndValidateFile(Buffer.from(''), 'empty.csv', 0);
        return !res.isValid || res.sheets.length === 0;
      }
    },
    {
      name: '2. Spreadsheet Formula Injection Cell Handling',
      test: () => {
        const payload = realPilotPipelineEngine.parseAndValidateFile(Buffer.from('customer_name,invoice_number,amount,due_date\n=CMD|" /C calc"!A0,INV-999,100,2026-09-30'), 'injection.csv', 100);
        return payload.isValid;
      }
    }
  ];

  for (const item of errorMatrix) {
    console.log(`Test '${item.name}':`, item.test() ? 'PASSED' : 'FAILED');
  }
}

testFullPilotWorkflow().catch(console.error);
