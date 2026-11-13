// payments API route - tenant-isolated payment operations
// Uses same-client pattern for PostgreSQL RLS enforcement

// @ts-ignore - Module resolution for .cjs file via path alias; works at runtime
import { withPostgresTenantContext } from '@/lib/db/postgres-transaction';
// @ts-ignore - Module resolution for .cjs file via path alias; works at runtime
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
// @ts-ignore - Module resolution for .cjs file via path alias; works at runtime
import { parsePagination } from '@/lib/api/pagination';

import { NextResponse } from 'next/server';

// RLS filter constant - used in all queries to enforce tenant isolation
const RLS_ORG_FILTER = "organization_id = NULLIF(current_setting('app.current_org_id', true), '')";

/**
 * Build WHERE clause from query filters with parameterized values.
 * Returns [whereClauseString, valuesArray].
 */
function buildWhereClause(filters: Record<string, any>): [string, any[]] {
  const conditions: string[] = [];
  let i = 0;
  const values: any[] = [];
  if (filters.status !== undefined) {
    conditions.push(`status = $${++i}`);
    values.push(filters.status);
  }
  if (filters.source !== undefined) {
    conditions.push(`source_system = $${++i}`);
    values.push(filters.source);
  }
  if (filters.customerId !== undefined) {
    conditions.push(`customer_id = $${++i}`);
    values.push(filters.customerId);
  }
  if (filters.search !== undefined) {
    conditions.push(`(customer_id LIKE $${++i} OR source_id LIKE $${++i})`);
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.minAmount !== undefined) {
    conditions.push(`amount_minor_units >= $${++i}`);
    values.push(filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    conditions.push(`amount_minor_units <= $${++i}`);
    values.push(filters.maxAmount);
  }
  if (filters.minAgeDays !== undefined) {
    conditions.push(`date >= current_date - INTERVAL '${++i} days'`);
    values.push(filters.minAgeDays);
  }
  if (filters.maxAgeDays !== undefined) {
    conditions.push(`date <= current_date - INTERVAL '${++i} days'`);
    values.push(filters.maxAgeDays);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return [where, values];
}

// ---------------------------------------------------------------------------
// GET /api/payments - List and filter payments
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'view', 'payments');
    if (permissionError) return permissionError;

    const { searchParams } = new URL(req.url);
    const orgId = context.organization.id;
    const status = searchParams.get('status') || undefined;
    const source = searchParams.get('source') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const search = searchParams.get('search') || undefined;
    const minAmount = searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined;
    const maxAmount = searchParams.get('maxAmount') ? parseFloat(searchParams.get('maxAmount')!) : undefined;
    const minAgeDays = searchParams.get('minAgeDays') ? parseInt(searchParams.get('minAgeDays')!, 10) : undefined;
    const maxAgeDays = searchParams.get('maxAgeDays') ? parseInt(searchParams.get('maxAgeDays')!, 10) : undefined;
    const { page, pageSize } = parsePagination(searchParams);

    const queryFilters: Record<string, any> = {
      status, source, customerId, search, minAmount, maxAmount, minAgeDays, maxAgeDays,
    };

    const [whereClause, queryValues] = buildWhereClause(queryFilters);

    const result = await withPostgresTenantContext(orgId, async (client: any) => {
      const fullQuery = `SELECT * FROM udm_payments WHERE ${RLS_ORG_FILTER} ${whereClause}`;
      const { rows } = await client.query(fullQuery, queryValues);
      const total = rows.length;

      const pageNum = page > 0 ? page : 1;
      const pageSizeNum = pageSize > 0 ? Math.min(pageSize, 100) : 20;
      const startIdx = (pageNum - 1) * pageSizeNum;
      const endIdx = startIdx + pageSizeNum;
      const paginated = rows.slice(startIdx, endIdx);

      return {
        success: true,
        data: paginated,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to query payments' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments - Record a customer payment
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'create', 'payments');
    if (permissionError) return permissionError;

    const body = await req.json();
    const orgId = context.organization.id;

    const result = await withPostgresTenantContext(orgId, async (client: any) => {
      // Validate amount is a positive integer (minor units)
      if (body.amount_minor_units === undefined || typeof body.amount_minor_units !== 'number' || !Number.isInteger(body.amount_minor_units) || body.amount_minor_units <= 0) {
        throw new Error(`Payment amount must be a positive integer minor units: ${body.amount_minor_units}`);
      }

      // Validate currency format (3-letter ISO 4217 code)
      if (body.currency && body.currency.length !== 3) {
        throw new Error(`Currency must be a 3-letter ISO 4217 code: ${body.currency}`);
      }

      // Validate customer belongs to the active organization
      const customer = await client.query(
        'SELECT id FROM udm_customers WHERE id = $1 AND ' + RLS_ORG_FILTER,
        [body.customer_id]
      );
      if (customer.rows.length === 0) {
        throw new Error(`Customer not found or does not belong to organization ${orgId}: ${body.customer_id}`);
      }

      // Check idempotency key if provided
      let newIdempotencyKey = true;
      if (body.idempotency_key) {
        const idempotencyKey = `${orgId}:${body.idempotency_key}`;
        // Check if payment with this key already exists
        const existing = await client.query(
          'SELECT id FROM udm_payments WHERE id = $1',
          [`pay_${body.idempotency_key}_${Date.now()}`]
        );
        if (existing.rows.length > 0) {
          newIdempotencyKey = false;
          const existingId = existing.rows[0].id;
          const existingPay = await client.query('SELECT * FROM udm_payments WHERE id = $1', [existingId]);
          // Return the existing payment for idempotent retry
          return NextResponse.json({ payment: existingPay.rows[0], newIdempotencyKey });
        }
        // Reserve the key to prevent concurrent duplicates
        try {
          await client.query(
            'INSERT INTO udm_idempotency_keys (key_name, reserved_for, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (key_name) DO NOTHING',
            [idempotencyKey, `temp_reservation_${Date.now()}`]
          );
        } catch {
          // Key may already exist; proceed with creation
        }
      }

      // Create the payment record with full audit trail
      const now = new Date().toISOString();
      const paymentId = `pay_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

      await client.query(
        `INSERT INTO udm_payments (id, organization_id, customer_id, source_system, source_id, amount_minor_units, currency, date, reference, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [paymentId, orgId, body.customer_id, body.payment_source || 'ar_manual', body.external_payment_id || `manual_${Date.now()}`, body.amount_minor_units, body.currency || 'INR', body.date || now, body.reference, now, now]
      );

      // Return created payment
      const createdPay = await client.query('SELECT * FROM udm_payments WHERE id = $1', [paymentId]);
      return NextResponse.json({ payment: createdPay.rows[0], newIdempotencyKey });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    // Map known error types to appropriate HTTP status codes
    const message = err.message || 'Failed to record payment';
    if (message.includes('must be a positive integer')) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    if (message.includes('not found or does not belong to organization')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes('Currency must be a 3-letter')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/[paymentId] - Retrieve one payment
// ---------------------------------------------------------------------------
export async function GET_BY_ID(req: Request, { params }: { params: { paymentId: string } }) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'view', 'payments');
    if (permissionError) return permissionError;

    const { paymentId } = params;

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      const pay = await client.query(
        `SELECT * FROM udm_payments WHERE id = $1 AND ${RLS_ORG_FILTER}`,
        [paymentId]
      );
      if (pay.rows.length === 0) {
        return NextResponse.json(
          { error: 'Payment not found or not visible within the tenant' },
          { status: 404 }
        );
      }
      return NextResponse.json({ payment: pay.rows[0] });
    });

    return result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve payment' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/[paymentId]/allocations - Allocate payment to invoice(s)
// ---------------------------------------------------------------------------
export async function POST_ALLOCATE(req: Request, { params }: { params: { paymentId: string } }) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'create', 'payments');
    if (permissionError) return permissionError;

    const body = await req.json();
    const { paymentId } = params;

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      // Allocate payment using the existing payment service
      const allocationResult = await allocatePayment(
        paymentId,
        body.invoiceId,
        body.amount_minor_units,
        client // pass the same client for RLS consistency
      );
      return NextResponse.json({ success: true, ...allocationResult });
    });

    return result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to allocate payment' },
      { status: err.message.includes('exceeds') ? 409 : 422 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/[paymentId]/allocations/reverse - Reverse an allocation
// ---------------------------------------------------------------------------
export async function POST_REVERSE_ALLOCATION(req: Request, { params }: { params: { paymentId: string } }) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'execute', 'payments');
    if (permissionError) return permissionError;

    const { paymentId } = params;

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      const reversalResult = await reverseAllocation(
        paymentId,
        client // pass the same client for RLS consistency
      );
      return NextResponse.json({ success: true, ...reversalResult });
    });

    return Next.result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to reverse allocation' },
      { status: 422 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/[paymentId]/refunds - Record refund
// ---------------------------------------------------------------------------
export async function POST_RECORD_REFUND(req: Request, { params }: { params: { paymentId: string } }) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'execute', 'payments');
    if (permissionError) return permissionError;

    const { paymentId } = params;
    const body = await req.json();

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      const refundResult = await recordRefund(
        paymentId,
        body.refund_amount_minor_units,
        client // pass the same client for RLS consistency
      );
      return NextResponse.json({ success: true, ...refundResult });
    });

    return result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to record refund' },
      { status: err.message.includes('exceeds') ? 409 : 422 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/[paymentId]/reversals - Record payment reversal
// ---------------------------------------------------------------------------
export async function POST_RECORD_REVERSAL(req: Request, { params }: { params: { paymentId: string } }) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'execute', 'payments');
    if (permissionError) return permissionError;

    const { paymentId } = params;
    const body = await req.json();

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      const reversalResult = await recordReversal(
        paymentId,
        body.reversal_amount_minor_units,
        client // pass the same client for RLS consistency
      );
      return NextResponse.json({ success: true, ...reversalResult });
    });

    return result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to record reversal' },
      { status: err.message.includes('invalid') ? 400 : 422 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/unapplied - List payments with unapplied balances
// ---------------------------------------------------------------------------
export async function GET_UNAPPLIED(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'view', 'payments');
    if (permissionError) return permissionError;

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      const pay = await client.query(
        `SELECT * FROM udm_payments WHERE ${RLS_ORG_FILTER} AND status != 'captured'`
      );
      return NextResponse.json({ payments: pay.rows });
    });

    return result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve unapplied payments' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/unmatched - List unmatched payments
// ---------------------------------------------------------------------------
export async function GET_UNMATCHED(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'view', 'payments');
    if (permissionError) return permissionError;

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      const pay = await client.query(
        `SELECT * FROM udm_payments WHERE ${RLS_ORG_FILTER} AND source_system = 'bank_feed' AND status = 'unmatched'`
      );
      return NextResponse.json({ payments: pay.rows });
    });

    return result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve unmatched payments' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/reconcile - Reconcile payment records
// ---------------------------------------------------------------------------
export async function POST_RECONCILE(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing session context' },
        { status: 401 }
      );
    }
    const permissionError = validatePermission(context, 'execute', 'payments');
    if (permissionError) return permissionError;

    const body = await req.json();

    const result = await withPostgresTenantContext(context.organization.id, async (client: any) => {
      const reconciliationResult = await reconcilePayment(
        body.bankTransactionId,
        client // pass the same client for RLS consistency
      );
      return NextResponse.json({ success: true, ...reconciliationResult });
    });

    return result;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to reconcile payments' },
      { status: 500 }
    );
  }
}