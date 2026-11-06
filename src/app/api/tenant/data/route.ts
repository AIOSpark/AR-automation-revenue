import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { tenantStore } from "@/lib/tenant/store";
import { validatePilotReadOnly } from "@/lib/auth/pilot";

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "view", "invoices");
  if (permissionError) return permissionError;

  // Enforces DB Row-Level Security (RLS) query context!
  const invoices = tenantStore.queryTenantTable("invoices");
  const customers = tenantStore.queryTenantTable("customers");
  const exceptions = tenantStore.queryTenantTable("exceptions");

  return NextResponse.json({
    organizationId: context!.organization.id,
    role: context!.role,
    invoices,
    customers,
    exceptions,
  });
}

export async function POST(request: NextRequest) {
  const context = await resolveTenantContext(request);
  
  // RBAC Action check: Action approval requires "approve" permission on "approvals"
  const body = await request.json();
  const { action_type } = body;

  if (action_type === "approve_resolution") {
    const permissionError = validatePermission(context, "approve", "approvals");
    if (permissionError) return permissionError;
  } else {
    const permissionError = validatePermission(context, "create", "invoices");
    if (permissionError) return permissionError;
  }

  // Read-only pilot mode: invoice creation is a prohibited mutation.
  const pilotError = validatePilotReadOnly(context!.organization.id, 'INVOICE_MODIFICATION');
  if (pilotError) return pilotError;

  // Insert tenant-scoped record matching active tenant context
  const newInvoice = tenantStore.insertTenantRecord("invoices", {
    organization_id: context!.organization.id,
    invoice_number: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    amount: body.amount || 1500000,
    status: body.status || "Payment Blocked",
    po_number: body.po_number || "PO-9921",
  });

  return NextResponse.json({
    message: "Tenant record created successfully",
    invoice: newInvoice,
  });
}
