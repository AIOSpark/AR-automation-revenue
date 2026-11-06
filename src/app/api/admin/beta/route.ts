// AIOSpark Beta Metrics Tracker API Endpoint (Layer 31)

import { NextResponse } from 'next/server';
import { betaMetricsStore } from '@/lib/beta/store';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'view', 'organization_settings');
    if (permissionError) return permissionError;
    const { searchParams } = new URL(request.url);
    const orgId = context!.organization.id;

    const snapshots = betaMetricsStore.getSnapshots(orgId);
    const checkInLogs = betaMetricsStore.getCheckInLogs(orgId);
    const engineeringTasks = betaMetricsStore.getEngineeringTasks(orgId);
    const humanTags = betaMetricsStore.getTags(orgId);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      snapshots,
      checkInLogs,
      engineeringTasks,
      humanTags,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const permissionError = validatePermission(context, 'edit', 'organization_settings');
    if (permissionError) return permissionError;
    const body = await request.json();
    const { action, weekStartDate, exceptionId, isCorrect, notes, issuesRaised, checkInLogId, issueId } = body;
    const organizationId = context!.organization.id;

    if (action === 'tag_classification') {
      const tag = betaMetricsStore.tagClassificationResult({
        organization_id: organizationId,
        week_start_date: weekStartDate || '2026-03-02',
        exception_id: exceptionId,
        is_correct: Boolean(isCorrect),
        tagged_by_user_id: context!.user.id,
        notes,
      });

      // Refresh snapshot for week
      const snapshot = betaMetricsStore.generateWeeklySnapshot(organizationId, weekStartDate || '2026-03-02');

      return NextResponse.json({ success: true, action: 'tag_classification', tag, snapshot });
    }

    if (action === 'record_checkin') {
      const checkIn = betaMetricsStore.recordCheckIn({
        organization_id: organizationId,
        week_start_date: weekStartDate || '2026-03-02',
        notes: notes || 'Weekly call completed cleanly.',
        issues_raised: issuesRaised || [],
        logged_by_user_id: context!.user.id,
      });
      return NextResponse.json({ success: true, action: 'record_checkin', checkIn });
    }

    if (action === 'convert_issue_to_task') {
      const res = betaMetricsStore.convertIssueToEngineeringTask(checkInLogId, issueId);
      return NextResponse.json({ success: true, action: 'convert_issue_to_task', task: res.task, checkInLog: res.checkInLog });
    }

    if (action === 'generate_snapshot') {
      const snapshot = betaMetricsStore.generateWeeklySnapshot(organizationId, weekStartDate || '2026-03-02');
      return NextResponse.json({ success: true, action: 'generate_snapshot', snapshot });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
