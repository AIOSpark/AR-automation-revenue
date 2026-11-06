import { NextResponse } from 'next/server';
import { DataAdapter, OrgConnectionConfig } from '@/lib/adapters/types';
import { BankAdapter } from '@/lib/adapters/bank';
import { reconciliationEngine } from '@/lib/reconciliation/engine';
import { can } from '@/lib/tenant/permissions';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

const bankAdapter = new BankAdapter();

export async function GET(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const orgId = context!.organization.id;

  udmStore.setTenantContext(orgId);
  const bankTxs = udmStore.getBankTransactions();
  const outcomes = reconciliationEngine.getOutcomes(orgId);

  return NextResponse.json({
    organizationId: orgId,
    transactions: bankTxs,
    outcomes,
  });
}

export async function POST(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'edit', 'invoices');
  if (permissionError) return permissionError;
  const body = await request.json();
  const { action, rows } = body;
  const organizationId = context!.organization.id;

  // Read-only pilot mode enforcement: statement ingestion is a financial mutation.
  const pilotError = validatePilotReadOnly(organizationId, 'PAYMENT_INITIATION');
  if (pilotError) return pilotError;

  const config: OrgConnectionConfig = {
    organizationId,
    adapterType: 'bank',
    sourceSystem: 'manual_upload',
  };

  if (action === 'upload_statement') {
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows array is required for statement upload' }, { status: 400 });
    }

    const txs = await bankAdapter.ingestBankStatement(config, rows);
    const reconResult = await reconciliationEngine.reconcileTransactions(organizationId);

    return NextResponse.json({
      success: true,
      ingestedCount: txs.length,
      reconResult,
    });
  }

  if (action === 'run_reconciliation') {
    const reconResult = await reconciliationEngine.reconcileTransactions(organizationId);
    return NextResponse.json({
      success: true,
      reconResult,
    });
  }

  return NextResponse.json({ error: 'Invalid action. Supported: upload_statement, run_reconciliation' }, { status: 400 });
}
