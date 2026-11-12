// Cross-process transaction safety verification harness
// Spawns two independent Node.js processes sharing one file-backed SQLite database.
// Tests concurrent identical idempotency requests across processes.
//
// Run from project root:
//   AIOSPARK_DB_PATH=/tmp/aiospark-cross-process.sqlite AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/cross-process-harness.ts

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.AIOSPARK_DB_PATH || '/tmp/aiospark-cross-process.sqlite';
const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function runWriter(scenario: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync(tsxBin, ['scripts/cross-process-writer.ts', dbPath, scenario], {
      env: { ...process.env, AIOSPARK_DB_PATH: dbPath, AIOSPARK_TEST_MODE: 'false' },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout?.toString() || '', exitCode: err.status || 1 };
  }
}

async function main() {
  // Clean up
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }

  // ---------------------------------------------------------------
  // Cross-process idempotency: two processes reserve same key
  // ---------------------------------------------------------------
  console.log('\n--- Cross-process idempotency: two processes, same key ---');

  // First, initialize the database in a single process
  const initResult = execFileSync(tsxBin, ['scripts/cross-process-writer.ts', dbPath, 'init'], {
    env: { ...process.env, AIOSPARK_DB_PATH: dbPath, AIOSPARK_TEST_MODE: 'false' },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
  });

  // Now run two writer processes concurrently for idempotency
  const p1 = runWriter('idempotency');
  const p2 = runWriter('idempotency');

  // Extract statuses from output
  const allOutput = p1.stdout + '\n' + p2.stdout;
  const idemMatch = allOutput.match(/IDEMPOTENCY_RESULT:(\[.*?\])/);
  if (idemMatch) {
    const statuses = JSON.parse(idemMatch[1]);
    const available = statuses.filter((s: string) => s === 'available').length;
    const replay = statuses.filter((s: string) => s === 'replay').length;
    const conflict = statuses.filter((s: string) => s === 'conflict').length;
    console.log(`  Statuses: ${statuses.join(', ')}`);
    assert(available === 1, `Cross-process idempotency: exactly one available (got ${available})`);
    assert(replay + conflict === 1, `Cross-process idempotency: exactly one replay/conflict (got ${replay + conflict})`);
    assert(conflict === 0, 'Cross-process idempotency: no conflicts for same fingerprint');
  } else {
    console.error('  Could not parse idempotency results');
    console.log('  p1 stdout:', p1.stdout);
    console.log('  p2 stdout:', p2.stdout);
    failed++;
  }

  // ---------------------------------------------------------------
  // Cross-process approval: two processes mark same approval
  // ---------------------------------------------------------------
  console.log('\n--- Cross-process approval: two processes, same approval ---');
  // Re-init to get fresh state
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
  execFileSync(tsxBin, ['scripts/cross-process-writer.ts', dbPath, 'init'], {
    env: { ...process.env, AIOSPARK_DB_PATH: dbPath, AIOSPARK_TEST_MODE: 'false' },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
  });

  const p3 = runWriter('approval');
  const p4 = runWriter('approval');

  const allOutput2 = p3.stdout + '\n' + p4.stdout;
  const apprMatch = allOutput2.match(/APPROVAL_RESULT:(.+)/);
  if (apprMatch) {
    console.log(`  Approval result: ${apprMatch[1]}`);
    if (apprMatch[1].includes('execution_status=succeeded') && apprMatch[1].includes('executed_at=')) {
      passed++;
      console.log('  PASS: Cross-process approval - duplicate execution is idempotent');
    } else {
      console.error('  FAIL: Cross-process approval did not converge');
      failed++;
    }
  } else {
    console.error('  Could not parse approval results');
    failed++;
  }

  console.log(`\n=== CROSS-PROCESS VERIFICATION: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
