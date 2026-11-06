import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'aiospark',
    persistence: {
      driver: 'sqlite',
      configured: process.env.AIOSPARK_TEST_MODE !== 'true' && Boolean(process.env.AIOSPARK_DB_PATH),
    },
    timestamp: new Date().toISOString(),
  });
}
