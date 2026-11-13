// AIOSpARK Financial Execution Recovery Test (runner)
// Runs the recovery acceptance tests (A-J) in a file-backed SQLite process.
//
// Run: AIOSPARK_DB_PATH=<temp sqlite file> AIOSPARK_TEST_MODE=false node --import tsx scripts/test-financial-recovery.mjs

import '../src/lib/testing/__tests__/financial-recovery.test.ts';
