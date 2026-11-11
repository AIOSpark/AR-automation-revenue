import { NextResponse } from 'next/server';
import { udmStore } from '@/lib/udm/store';
import { computeCustomerFinancialProfile } from '@/lib/customer/risk-engine';
import { computeTotalReceivables, computeAtRiskReceivables } from '@/lib/dashboard/engine';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { parsePagination } from '@/lib/api/pagination';
import { validatePilotReadOnly } from '@/lib/auth/pilot';
import { extractIdempotencyKey, computeRequestFingerprint, checkAndReserveIdempotency, finalizeIdempotency, releaseIdempotency } from '@/lib/idempotency';

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'view', 'customers');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(request.url);
    const orgId = context!.organization.id;

    udmStore.setTenantContext(orgId);

    const q = (searchParams.get('q') || '').toLowerCase().trim();
    const riskFilter = searchParams.get('risk');
    const hasOverdueFilter = searchParams.get('hasOverdue');
    const sortBy = searchParams.get('sortBy') || 'outstanding';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const { page, pageSize } = parsePagination(searchParams);

    const rawCustomers = udmStore.getCustomers();
    const allInvoices = udmStore.getInvoices();
    const allExceptions = udmStore.getExceptions();
    const today = new Date().toISOString().split('T')[0];

    const totalReceivables = computeTotalReceivables(allInvoices, orgId);

    // Compute detailed customer records
    let customerList = rawCustomers.map((c) => {
      const profile = computeCustomerFinancialProfile(c.id, orgId, today);
      const custInvoices = allInvoices.filter((i) => i.customer_id === c.id);
      const openInvoices = custInvoices.filter((i) => ['open', 'partially_paid', 'disputed'].includes(i.status));
      const openExps = allExceptions.filter((e) => e.customer_id === c.id && e.status !== 'closed');
      const atRiskAmount = computeAtRiskReceivables(openInvoices, orgId, today);

      const pct = totalReceivables > 0 ? (profile.totalOutstandingMinorUnits / totalReceivables) * 100 : 0;
      const dso = profile.avgPaymentTimeDaysT12M > 0 ? profile.avgPaymentTimeDaysT12M : (c.payment_terms_days || 30);

      return {
        id: c.id,
        sourceId: c.source_id,
        name: c.name,
        industry: c.industry || 'Enterprise B2B',
        creditLimitMinorUnits: c.credit_limit_minor_units || 0,
        paymentTermsDays: c.payment_terms_days || 30,
        currency: c.currency || 'INR',
        totalOutstandingMinorUnits: profile.totalOutstandingMinorUnits,
        totalOverdueMinorUnits: profile.totalOverdueMinorUnits,
        atRiskMinorUnits: atRiskAmount,
        invoiceCount: custInvoices.length,
        openInvoiceCount: openInvoices.length,
        openExceptionCount: openExps.length,
        dsoDays: dso,
        riskScore: profile.riskScore,
        riskBand: profile.riskBand,
        percentageOfTotalReceivables: Math.round(pct * 10) / 10,
        createdAt: c.created_at,
      };
    });

    // Apply text search
    if (q) {
      customerList = customerList.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.sourceId.toLowerCase().includes(q) ||
          c.industry.toLowerCase().includes(q)
      );
    }

    // Apply risk filter
    if (riskFilter && ['high', 'medium', 'low'].includes(riskFilter)) {
      customerList = customerList.filter((c) => c.riskBand === riskFilter);
    }

    // Apply overdue filter
    if (hasOverdueFilter === 'true') {
      customerList = customerList.filter((c) => c.totalOverdueMinorUnits > 0);
    }

    // Apply sorting
    customerList.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'outstanding') {
        comparison = a.totalOutstandingMinorUnits - b.totalOutstandingMinorUnits;
      } else if (sortBy === 'overdue') {
        comparison = a.totalOverdueMinorUnits - b.totalOverdueMinorUnits;
      } else if (sortBy === 'dso') {
        comparison = a.dsoDays - b.dsoDays;
      } else if (sortBy === 'risk') {
        comparison = a.riskScore - b.riskScore;
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else {
        comparison = a.totalOutstandingMinorUnits - b.totalOutstandingMinorUnits;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Portfolio summary calculations
    const totalOutstandingExposure = customerList.reduce((acc, c) => acc + c.totalOutstandingMinorUnits, 0);
    const totalOverdueExposure = customerList.reduce((acc, c) => acc + c.totalOverdueMinorUnits, 0);
    const highRiskCount = customerList.filter((c) => c.riskBand === 'high').length;
    const avgDsoDays =
      customerList.length > 0
        ? Math.round(customerList.reduce((acc, c) => acc + c.dsoDays, 0) / customerList.length)
        : 30;

    // Pagination
    const totalCount = customerList.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const paginatedCustomers = customerList.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      success: true,
      customers: paginatedCustomers,
      summary: {
        totalCustomers: totalCount,
        totalOutstandingExposureMinorUnits: totalOutstandingExposure,
        totalOverdueExposureMinorUnits: totalOverdueExposure,
        highRiskCount,
        avgDsoDays,
      },
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve customer accounts' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'create', 'customers');
    if (permissionError) return permissionError;
    const orgId = context!.organization.id;

    // Idempotency: require Idempotency-Key header for financial creation
    const idempotencyKey = extractIdempotencyKey(request);
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required for customer creation' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const fingerprint = computeRequestFingerprint(body);

    // Atomically check and reserve the idempotency key under lock
    const idempotencyCheck = await checkAndReserveIdempotency(orgId, 'customers', idempotencyKey, fingerprint);
    if (idempotencyCheck.status === 'replay') {
      return NextResponse.json(idempotencyCheck.response, { status: 200 });
    }
    if (idempotencyCheck.status === 'conflict') {
      return NextResponse.json(
        { error: 'Idempotency-Key already used with a different request body' },
        { status: 409 }
      );
    }

    // Read-only pilot mode: customer record creation is a prohibited mutation.
    const pilotError = validatePilotReadOnly(orgId, 'CUSTOMER_RECORD_MUTATION');
    if (pilotError) {
      releaseIdempotency(orgId, 'customers', idempotencyKey);
      return pilotError;
    }

    const { name, source_id, credit_limit_minor_units, payment_terms_days, industry, currency } = body;

    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 200) {
      releaseIdempotency(orgId, 'customers', idempotencyKey);
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const creditLimit = credit_limit_minor_units === undefined ? 10000000 : credit_limit_minor_units;
    const paymentTerms = payment_terms_days === undefined ? 30 : payment_terms_days;
    if (!Number.isSafeInteger(creditLimit) || creditLimit < 0) {
      releaseIdempotency(orgId, 'customers', idempotencyKey);
      return NextResponse.json({ error: 'credit_limit_minor_units must be a non-negative integer' }, { status: 400 });
    }
    if (!Number.isSafeInteger(paymentTerms) || paymentTerms < 0 || paymentTerms > 3650) {
      releaseIdempotency(orgId, 'customers', idempotencyKey);
      return NextResponse.json({ error: 'payment_terms_days must be an integer between 0 and 3650' }, { status: 400 });
    }
    if (currency !== undefined && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))) {
      releaseIdempotency(orgId, 'customers', idempotencyKey);
      return NextResponse.json({ error: 'currency must be a three-letter uppercase code' }, { status: 400 });
    }
    if (source_id !== undefined && (typeof source_id !== 'string' || source_id.trim().length > 200)) {
      releaseIdempotency(orgId, 'customers', idempotencyKey);
      return NextResponse.json({ error: 'source_id must be a string of 200 characters or fewer' }, { status: 400 });
    }

    udmStore.setTenantContext(orgId);
    const newCustomer = udmStore.insertCustomer({
      organization_id: orgId,
      source_system: 'manual',
      source_id: source_id || `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
      name: name.trim(),
      credit_limit_minor_units: creditLimit,
      currency: currency || 'INR',
      payment_terms_days: paymentTerms,
      industry: industry || 'Enterprise B2B',
      created_by: 'user',
    });

    // Finalize idempotency key after successful creation
    finalizeIdempotency(orgId, 'customers', idempotencyKey, newCustomer.id, fingerprint, {
      success: true,
      customer: newCustomer,
    });

    return NextResponse.json({
      success: true,
      customer: newCustomer,
    });
  } catch (err: any) {
    // Key is automatically released by the transaction lock on error
    return NextResponse.json(
      { error: err.message || 'Failed to create customer record' },
      { status: 500 }
    );
  }
}
