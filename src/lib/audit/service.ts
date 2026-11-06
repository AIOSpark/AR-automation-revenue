// AIOSpark Audit Service (Layer 26)
// Provides unified helper for logging audit events and exporting audit reports (CSV/PDF)

import { auditStore, AuditLogRecord, RecordAuditParams } from './store';

export class AuditService {
  /**
   * Primary entry point to record an audit log event
   */
  public static record(params: RecordAuditParams): AuditLogRecord {
    return auditStore.record(params);
  }

  /**
   * Helper to format an audit trail into CSV string for export
   */
  public static exportToCSV(records: AuditLogRecord[]): string {
    const headers = [
      'Timestamp',
      'Audit ID',
      'Organization ID',
      'Actor Type',
      'Actor User ID',
      'Action Type',
      'Subject Type',
      'Subject ID',
      'Result',
      'Before State',
      'After State',
      'AI Context',
      'Approval Context',
    ];

    const escapeField = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = records.map((r) => [
      escapeField(r.created_at),
      escapeField(r.id),
      escapeField(r.organization_id),
      escapeField(r.actor_type),
      escapeField(r.actor_user_id),
      escapeField(r.action_type),
      escapeField(r.subject_type),
      escapeField(r.subject_id),
      escapeField(r.result),
      escapeField(r.before_state),
      escapeField(r.after_state),
      escapeField(r.ai_context),
      escapeField(r.approval_context),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  /**
   * Helper to generate a text-formatted audit report (for PDF/Document rendering)
   */
  public static exportToPDFText(title: string, records: AuditLogRecord[]): string {
    let report = `================================================================================\n`;
    report += `AIOSPARK AUDIT TRAIL REPORT: ${title.toUpperCase()}\n`;
    report += `Generated At: ${new Date().toISOString()}\n`;
    report += `Total Events: ${records.length}\n`;
    report += `================================================================================\n\n`;

    records.forEach((r, idx) => {
      report += `[EVENT #${idx + 1}] ${r.created_at} | Result: ${r.result.toUpperCase()}\n`;
      report += `  - Audit ID: ${r.id}\n`;
      report += `  - Actor: ${r.actor_type.toUpperCase()} ${r.actor_user_id ? `(User ID: ${r.actor_user_id})` : ''}\n`;
      report += `  - Action: ${r.action_type}\n`;
      report += `  - Subject: ${r.subject_type.toUpperCase()} (ID: ${r.subject_id})\n`;
      if (r.approval_context) {
        report += `  - Approval Request ID: ${r.approval_context.approval_request_id || 'N/A'} (Outcome: ${r.approval_context.status || 'approved'})\n`;
      }
      if (r.ai_context) {
        report += `  - AI Context: Agent=${r.ai_context.agent_name || 'N/A'}, Confidence=${r.ai_context.confidence ?? 'N/A'}\n`;
      }
      if (r.before_state) {
        report += `  - Before State: ${JSON.stringify(r.before_state)}\n`;
      }
      if (r.after_state) {
        report += `  - After State: ${JSON.stringify(r.after_state)}\n`;
      }
      report += `--------------------------------------------------------------------------------\n`;
    });

    return report;
  }
}
