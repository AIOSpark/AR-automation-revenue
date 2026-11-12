// Independent verification: API idempotency crash recovery scenarios A-F
// Uses file-backed SQLite database.
//
// Run from project root:
//   AIOSPARK_DB_PATH=/tmp/aiospark-verify-idem.sqlite AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/verify-idempotency.ts

import { udmStore } from '../src/lib/udm/store';

const dbPath = process.env.AIOSPARK_DB_PATH;
if (!dbPath) {
  console.error('FAIL: AIOSPARK_DB_PATH must be set');
  process.exit(1);
}

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

async function main() {
  const ORG = 'org_idem_verify';
  const ENDPOINT = 'payments';
  const KEY = 'idem-verify-key-1';
  const FP1 = 'fingerprint-a';
  const FP2 = 'fingerprint-b';

  // Clear state
  udmStore.clearAll();
  udmStore.setTenantContext(ORG);

  // ---------------------------------------------------------------
  // Scenario A: Committed operation + same key + same fingerprint → replay
  // ---------------------------------------------------------------
  console.log('\n--- Scenario A: Committed + same key + same fingerprint → replay ---');
  const check1 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY, FP1);
  assert(check1.status === 'available', 'A1: First call returns available');

  // Simulate completing the financial operation and finalizing
  udmStore.finalizeApiIdempotency(ORG, ENDPOINT, KEY, 'record-123', FP1, { success: true, id: 'record-123' });

  const check2 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY, FP1);
  assert(check2.status === 'replay', `A2: Same key + same fingerprint → replay (got ${check2.status})`);
  assert(check2.recordId === 'record-123', `A3: Replay returns original record ID (got ${check2.recordId})`);
  assert(check2.response !== null && (check2.response as { id: string }).id === 'record-123', 'A4: Replay returns original stored result');

  // ---------------------------------------------------------------
  // Scenario B: Reserved operation + same key + same fingerprint
  // ---------------------------------------------------------------
  console.log('\n--- Scenario B: Reserved + same key + same fingerprint ---');
  const KEY_B = 'idem-verify-key-b';
  const checkB1 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_B, FP1);
  assert(checkB1.status === 'available', 'B1: First call returns available (key reserved)');

  // Do NOT finalize — simulate crash after reserve but before commit
  const checkB2 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_B, FP1);
  assert(checkB2.status === 'replay', `B2: Reserved + same key + same fingerprint → replay (got ${checkB2.status})`);
  assert(checkB2.recordId === null, 'B3: Reserved replay has null record ID (not yet finalized)');
  assert(checkB2.response === null, 'B4: Reserved replay has null response (not yet finalized)');
  assert(checkB2.status !== 'available', 'B5: Reserved key does NOT return available (prevents double execution)');

  // ---------------------------------------------------------------
  // Scenario C: Reserved operation + different fingerprint → conflict
  // ---------------------------------------------------------------
  console.log('\n--- Scenario C: Reserved + different fingerprint → conflict ---');
  const KEY_C = 'idem-verify-key-c';
  const checkC1 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_C, FP1);
  assert(checkC1.status === 'available', 'C1: First call reserves key');

  const checkC2 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_C, FP2);
  assert(checkC2.status === 'conflict', `C2: Same key + different fingerprint → conflict (got ${checkC2.status})`);
  assert(checkC2.recordId === null, 'C3: Conflict has null record ID');

  // ---------------------------------------------------------------
  // Scenario D: Failed operation → deterministic recovery
  // ---------------------------------------------------------------
  console.log('\n--- Scenario D: Failed operation → deterministic recovery ---');
  const KEY_D = 'idem-verify-key-d';
  const checkD1 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_D, FP1);
  assert(checkD1.status === 'available', 'D1: First call returns available');

  udmStore.releaseApiIdempotency(ORG, ENDPOINT, KEY_D);

  const checkD2 = await udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_D, FP1);
  assert(checkD2.status === 'available', `D2: After release, same key → available (got ${checkD2.status})`);

  // ---------------------------------------------------------------
  // Scenario E: Concurrent identical requests → only one financial effect
  // ---------------------------------------------------------------
  console.log('\n--- Scenario E: Concurrent identical requests (in-process) ---');
  const KEY_E = 'idem-verify-key-e';
  const resultsE = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_E, FP1)
    )
  );
  const availableE = resultsE.filter((r) => r.status === 'available');
  const replayE = resultsE.filter((r) => r.status === 'replay');
  assert(availableE.length === 1, `E1: Exactly one available (got ${availableE.length})`);
  assert(replayE.length === 9, `E2: Nine replays (got ${replayE.length})`);

  // ---------------------------------------------------------------
  // Scenario F: Concurrent conflicting requests → only correct fingerprint owns key
  // ---------------------------------------------------------------
  console.log('\n--- Scenario F: Concurrent conflicting requests ---');
  const KEY_F = 'idem-verify-key-f';
  const resultsF = await Promise.all([
    udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_F, FP1),
    udmStore.checkAndReserveApiIdempotency(ORG, ENDPOINT, KEY_F, FP2),
  ]);
  const statusesF = resultsF.map((r) => r.status);
  assert(statusesF.includes('available'), `F1: One request gets available (got ${statusesF.join(',')})`);
  assert(statusesF.includes('conflict'), `F2: One request gets conflict (got ${statusesF.join(',')})`);
  assert(!statusesF.includes('replay'), 'F3: No replay for conflicting fingerprint');

  console.log(`\n=== API IDEMPOTENCY VERIFICATION: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
