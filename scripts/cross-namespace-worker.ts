import { closeDatabase } from '../src/lib/db/durable-repository';

const mode = process.env.XNS_MODE || '';
const startAt = Number(process.env.XNS_START_AT || '0');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function barrier() {
  const delay = startAt - Date.now();
  if (delay > 0) await sleep(delay);
}

async function approvalDecision() {
  const { POST } = await import('../src/app/api/approvals/[id]/route');
  const { createSessionToken } = await import('../src/lib/auth/session');

  const id = process.env.XNS_APPROVAL_ID!;
  const orgId = process.env.XNS_ORG_ID!;
  const userId = process.env.XNS_USER_ID!;
  const decision = process.env.XNS_DECISION!;
  const token = createSessionToken(userId);
  if (!token) throw new Error('failed to create session token');

  await barrier();
  const response = await POST(
    new Request(`http://localhost/api/approvals/${id}`, {
      method: 'POST',
      headers: {
        cookie: `aiospark_session=${token}; aiospark_active_org=${orgId}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: decision, reason: 'concurrency test' }),
    }),
    { params: Promise.resolve({ id }) }
  );
  const body = await response.json();
  return { status: response.status, body };
}

async function billingSet() {
  const { billingStore, BillingConflictError } = await import('../src/lib/billing/store');
  await barrier();
  try {
    const updated = billingStore.setSubscription(
      process.env.XNS_ORG_ID!,
      { plan_id: process.env.XNS_PLAN as any },
      { expectedVersion: Number(process.env.XNS_EXPECTED_VERSION) }
    );
    return { ok: true, version: updated.version, plan: updated.plan_id };
  } catch (error: any) {
    return {
      ok: false,
      code: error instanceof BillingConflictError ? error.code : 'UNEXPECTED',
      message: error?.message || String(error),
    };
  }
}

async function main() {
  const result =
    mode === 'approval-decision'
      ? await approvalDecision()
      : mode === 'billing-set'
        ? await billingSet()
        : { error: `unknown mode ${mode}` };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  closeDatabase();
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ error: error?.message || String(error) })}\n`);
  try {
    closeDatabase();
  } catch {
    // Process is exiting.
  }
  process.exit(1);
});
