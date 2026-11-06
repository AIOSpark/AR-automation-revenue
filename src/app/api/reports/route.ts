import { NextResponse } from 'next/server';
import { ALL_REPORTS, getReportDefinition } from '@/lib/reports/definitions';
import { sharedReportingService, ExportFormat } from '@/lib/reports/export-service';
import { reportSchedulerStore } from '@/lib/reports/scheduler';
import { udmStore } from '@/lib/udm/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { AuditService } from '@/lib/audit/service';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

export async function GET(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const orgId = context!.organization.id;

  udmStore.setTenantContext(orgId);

  const reportsList = ALL_REPORTS.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    description: r.description,
    dsoFormulaNotice: r.dsoFormulaNotice || null,
    columnCount: r.columns.length,
  }));

  const schedules = reportSchedulerStore.getSchedules(orgId);

  return NextResponse.json({
    organizationId: orgId,
    reports: reportsList,
    schedules,
  });
}

export async function POST(request: Request) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, 'view', 'invoices');
  if (permissionError) return permissionError;

  const body = await request.json();
  const {
    action,
    reportId,
    format = 'csv',
    params = {},
    recipients,
    cadence = 'weekly',
  } = body;
  const organizationId = context!.organization.id;
  const userId = context!.user.id;

  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    return NextResponse.json({ error: 'Unsupported report format' }, { status: 400 });
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return NextResponse.json({ error: 'params must be an object' }, { status: 400 });
  }

  // Read-only pilot mode: distinguish internal review from external distribution.
  // generate_preview and generate_on_demand produce reports for internal review (allowed).
  // create_schedule and run_schedules_job distribute reports externally (blocked).
  if (action === 'create_schedule' || action === 'run_schedules_job') {
    const pilotError = validatePilotReadOnly(organizationId, 'EXTERNAL_CUSTOMER_COMMUNICATION');
    if (pilotError) return pilotError;
  } else if (action !== 'generate_preview' && action !== 'generate_on_demand') {
    // Unknown or unsupported action: fail closed.
    return NextResponse.json(
      { error: 'Invalid action. Supported: generate_preview, generate_on_demand, create_schedule, run_schedules_job' },
      { status: 400 }
    );
  }

  udmStore.setTenantContext(organizationId);

  if (action === 'generate_preview' || action === 'generate_on_demand') {
    const exportPermissionError = validatePermission(context, 'export', 'invoices');
    if (exportPermissionError) return exportPermissionError;

    const reportDef = getReportDefinition(reportId);
    if (!reportDef) {
      return NextResponse.json({ error: `Report not found: ${reportId}` }, { status: 404 });
    }

    const rows = await reportDef.queryFn(organizationId, params);

    if (action === 'generate_preview') {
      return NextResponse.json({
        reportId: reportDef.id,
        category: reportDef.category,
        name: reportDef.name,
        description: reportDef.description,
        dsoFormulaNotice: reportDef.dsoFormulaNotice || null,
        columns: reportDef.columns,
        rows,
        rowCount: rows.length,
        generatedAt: new Date().toISOString(),
      });
    }

    const output = await sharedReportingService.generateReport(
      reportDef,
      organizationId,
      params,
      format as ExportFormat
    );

    AuditService.record({
      organization_id: organizationId,
      actor_user_id: userId,
      actor_type: 'user',
      action_type: 'report_export',
      subject_type: 'organization',
      subject_id: organizationId,
      after_state: { reportId: output.reportId, format: output.format, rowCount: output.rowCount },
      result: 'success',
    });

    return new NextResponse(new Uint8Array(output.contentBuffer), {
      headers: {
        'Content-Type': output.mimeType,
        'Content-Disposition': `attachment; filename="${output.fileName}"`,
        'X-Report-Name': output.reportName,
        'X-Report-Count': String(output.rowCount),
      },
    });
  }

  if (action === 'create_schedule') {
    const exportPermissionError = validatePermission(context, 'export', 'invoices');
    if (exportPermissionError) return exportPermissionError;
    const schedulePermissionError = validatePermission(context, 'edit', 'invoices');
    if (schedulePermissionError) return schedulePermissionError;
    if (!reportId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'reportId and non-empty recipients array are required' }, { status: 400 });
    }
    if (!getReportDefinition(reportId)) {
      return NextResponse.json({ error: `Report not found: ${reportId}` }, { status: 404 });
    }
    if (!recipients.every((recipient: unknown) =>
      typeof recipient === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
    )) {
      return NextResponse.json({ error: 'recipients must contain valid email addresses' }, { status: 400 });
    }
    if (!['daily', 'weekly', 'monthly'].includes(cadence)) {
      return NextResponse.json({ error: 'Unsupported schedule cadence' }, { status: 400 });
    }

    const schedule = reportSchedulerStore.createSchedule({
      organization_id: organizationId,
      report_id: reportId,
      params,
      format: format as ExportFormat,
      recipients,
      cadence,
      created_by_user_id: userId,
    });

    AuditService.record({
      organization_id: organizationId,
      actor_user_id: userId,
      actor_type: 'user',
      action_type: 'report_schedule_created',
      subject_type: 'organization',
      subject_id: organizationId,
      after_state: { scheduleId: schedule.id, reportId, format, cadence, recipients },
      result: 'success',
    });

    return NextResponse.json({ success: true, schedule });
  }

  if (action === 'run_schedules_job') {
    const exportPermissionError = validatePermission(context, 'export', 'invoices');
    if (exportPermissionError) return exportPermissionError;
    const schedulePermissionError = validatePermission(context, 'edit', 'invoices');
    if (schedulePermissionError) return schedulePermissionError;
    const res = await reportSchedulerStore.runScheduledReportsJob(organizationId);
    AuditService.record({
      organization_id: organizationId,
      actor_user_id: userId,
      actor_type: 'user',
      action_type: 'report_schedule_run',
      subject_type: 'organization',
      subject_id: organizationId,
      after_state: res,
      result: res.errors.length > 0 ? 'failure' : 'success',
    });
    return NextResponse.json({ success: true, ...res });
  }

  return NextResponse.json(
    { error: 'Invalid action. Supported: generate_preview, generate_on_demand, create_schedule, run_schedules_job' },
    { status: 400 }
  );
}
