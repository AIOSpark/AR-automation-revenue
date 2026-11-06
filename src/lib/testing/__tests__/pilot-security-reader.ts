// AIOSpark Iteration 21.1 — Pilot Security Reader Script
// Executed as a child process via tsx to verify pilot mode survives restart.
// Reads from the SQLite file specified by AIOSPARK_DB_PATH env var.
//
// Run: npx tsx src/lib/testing/__tests__/pilot-security-reader.ts <PILOT_ORG_ID>

import fs from 'node:fs';
import { authStore } from '../../auth/store';
import { isPilotOrganization } from '../../auth/pilot';

const PILOT_ORG_ID = process.argv[2];

let passed = 0;
let failed = 0;

function testAssert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ [PILOT_PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [PILOT_FAIL] ${message}`);
    failed++;
  }
}

async function main() {
  console.log('\n==========================================');
  console.log('PILOT SECURITY READER (child process)');
  console.log('==========================================\n');
  console.log(`PILOT_ORG_ID=${PILOT_ORG_ID}`);
  console.log(`AIOSPARK_DB_PATH=${process.env.AIOSPARK_DB_PATH}`);

  // Fresh AuthStore in new process reads snapshot from SQLite file
  const org = authStore.getOrganizationById(PILOT_ORG_ID);
  testAssert(org !== null, 'Pilot org exists after restart');
  if (org) {
    testAssert(org.pilotMode === true, `org_pilot pilotMode === true after restart (got ${org.pilotMode})`);
  }

  console.log(`\n=== PILOT SECURITY READER SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Pilot security reader error:', err);
  process.exit(1);
});
