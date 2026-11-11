// AIOSpark Bulk Import Performance Benchmark
// Tests import throughput at 1K, 1.5K, 5K, 10K row scales
// Measures parsing, lookup, serialization, persistence, memory, and DB size

// Set env BEFORE any imports so durable-repository picks it up
process.env.AIOSPARK_DB_PATH = '/tmp/aiospark-import-bench.sqlite';
process.env.AIOSPARK_TEST_MODE = 'false';

import { udmStore } from '../src/lib/udm/store';
import { importEngine } from '../src/lib/import/engine';
import { authStore } from '../src/lib/auth/store';
import { setOrganizationReportingCurrency } from '../src/lib/financial/currency-org';
import { closeDatabase, readSnapshotDirect } from '../src/lib/db/durable-repository';
import * as fs from 'node:fs';

const DB_PATH = '/tmp/aiospark-import-bench.sqlite';

let allResults = [];

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateRows(count, startIdx = 0) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    rows.push({
      customer_name: `Customer ${idx}`,
      invoice_number: `INV-BENCH-${String(idx).padStart(6, '0')}`,
      amount: `${(1000 + (idx % 9000))}.00`,
      due_date: '2026-12-31',
    });
  }
  return rows;
}

function resetDatabase() {
  udmStore.clearAll();
  importEngine.clearAll();
  authStore.clearAll();
  // Force a fresh snapshot write by creating a new batch namespace is not needed;
  // clearAll deletes all snapshots, and the next writeSnapshot recreates them.
}

async function runBenchmark(rowCount) {
  resetDatabase();

  setOrganizationReportingCurrency(`org_bench_${rowCount}`, 'INR');
  if (!authStore.getOrganizationById(`org_bench_${rowCount}`)) {
    authStore.organizations.set(`org_bench_${rowCount}`, {
      id: `org_bench_${rowCount}`,
      name: `Benchmark Org ${rowCount}`,
      size: '50-200',
      industry: 'Fintech',
      created_by_user_id: 'user_bench',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      currency: 'INR',
    });
  }

  udmStore.setTenantContext(`org_bench_${rowCount}`);

  const rows = generateRows(rowCount);

  // Measure batch creation time
  const tCreateStart = process.hrtime.bigint();
  const batch = importEngine.createBatch(
    {
      organizationId: `org_bench_${rowCount}`,
      sourceSystem: 'csv_bench',
      dateFormatConvention: 'YYYY-MM-DD',
      currency: 'INR',
    },
    rows
  );
  const tCreateEnd = process.hrtime.bigint();
  const createMs = Number(tCreateEnd - tCreateStart) / 1_000_000;

  // Measure processing time (parsing + lookup + persistence)
  const tProcessStart = process.hrtime.bigint();
  const heapStart = process.memoryUsage().heapUsed;

  const result = importEngine.processBatch(batch.id, {
    organizationId: `org_bench_${rowCount}`,
    sourceSystem: 'csv_bench',
  });

  const tProcessEnd = process.hrtime.bigint();
  const heapEnd = process.memoryUsage().heapUsed;
  const processMs = Number(tProcessEnd - tProcessStart) / 1_000_000;
  const peakHeapDelta = heapEnd - heapStart;

  // Measure DB size
  const dbStats = fs.statSync(DB_PATH);
  const dbSize = dbStats.size;

  // Read snapshot from SQLite to verify
  const snapshot = readSnapshotDirect('udm');
  const persistedInvoices = snapshot ? (snapshot.invoices || []).length : 0;

  // Measure snapshot serialization time
  const tSerializeStart = process.hrtime.bigint();
  udmStore.persistSnapshot();
  const tSerializeEnd = process.hrtime.bigint();
  const serializeMs = Number(tSerializeEnd - tSerializeStart) / 1_000_000;

  // Don't close database between benchmarks - only at the end
  const benchResult = {
    rowCount,
    createMs,
    processMs,
    serializeMs,
    totalMs: createMs + processMs,
    successCount: result.successCount,
    skippedCount: result.skippedCount,
    persistedInvoices,
    peakHeapDeltaBytes: peakHeapDelta,
    peakHeapDeltaMB: (peakHeapDelta / 1024 / 1024).toFixed(2),
    dbSizeBytes: dbSize,
    dbSizeMB: (dbSize / 1024 / 1024).toFixed(2),
    rowsPerSecond: Math.round(rowCount / ((createMs + processMs) / 1000)),
  };

  allResults.push(benchResult);
  return benchResult;
}

async function main() {
  const scales = [1000, 1500, 5000, 10000];

  console.log('========================================');
  console.log('BULK IMPORT PERFORMANCE BENCHMARK');
  console.log('========================================\n');

  for (const scale of scales) {
    console.log(`\n--- Benchmark: ${scale.toLocaleString()} rows ---`);
    const result = await runBenchmark(scale);

    console.log(`  Records:            ${result.rowCount.toLocaleString()}`);
    console.log(`  Imported:           ${result.successCount.toLocaleString()}`);
    console.log(`  Skipped:            ${result.skippedCount}`);
    console.log(`  Persisted in SQLite: ${result.persistedInvoices.toLocaleString()}`);
    console.log(`  Batch create:       ${result.createMs.toFixed(2)} ms`);
    console.log(`  Process:            ${result.processMs.toFixed(2)} ms`);
    console.log(`  Serialize:          ${result.serializeMs.toFixed(2)} ms`);
    console.log(`  Total:              ${result.totalMs.toFixed(2)} ms`);
    console.log(`  Throughput:         ${result.rowsPerSecond.toLocaleString()} rows/sec`);
    console.log(`  Peak heap delta:    ${result.peakHeapDeltaMB} MB`);
    console.log(`  DB size:            ${result.dbSizeMB} MB`);
  }

  // Analyze scaling behavior
  console.log('\n========================================');
  console.log('SCALING ANALYSIS');
  console.log('========================================\n');

  const r1k = allResults.find(r => r.rowCount === 1000);
  const r10k = allResults.find(r => r.rowCount === 10000);

  if (r1k && r10k) {
    const timeRatio = r10k.totalMs / r1k.totalMs;
    const rowRatio = 10000 / 1000;
    const efficiency = (rowRatio / timeRatio).toFixed(2);

    console.log(`  1K → 10K time ratio:  ${timeRatio.toFixed(2)}x`);
    console.log(`  1K → 10K row ratio:   ${rowRatio}x`);
    console.log(`  Scaling efficiency:   ${efficiency}x (1.0 = linear, <1.0 = superlinear overhead)`);
    console.log(`  1K total time:        ${r1k.totalMs.toFixed(2)} ms`);
    console.log(`  10K total time:       ${r10k.totalMs.toFixed(2)} ms`);
    console.log(`  1K DB size:           ${r1k.dbSizeMB} MB`);
    console.log(`  10K DB size:          ${r10k.dbSizeMB} MB`);

    if (timeRatio > rowRatio * 1.2) {
      console.log(`  ⚠️  WARNING: Superlinear scaling detected - snapshot serialization overhead grows with dataset size`);
    } else {
      console.log(`  ✅ Scaling is within acceptable bounds (near-linear)`);
    }
  }

  console.log('\n========================================');
  console.log('BENCHMARK COMPLETE');
  console.log('========================================');

  closeDatabase();
}

main();
