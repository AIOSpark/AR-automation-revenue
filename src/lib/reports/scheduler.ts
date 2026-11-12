// AIOSpark Scheduled Report Delivery Engine & Store (Layer 23)
// Configures recurring report generation schedules and dispatches via Layer 19 TransactionalEmailProvider.

import { ExportFormat, sharedReportingService } from './export-service';
import { getReportDefinition } from './definitions';
import { TransactionalEmailProvider } from '../communication/email-provider';

export type ScheduleCadence = 'daily' | 'weekly' | 'monthly';

export interface ReportScheduleRecord {
  id: string;
  organization_id: string;
  report_id: string;
  params: Record<string, any>;
  format: ExportFormat;
  recipients: string[]; // Email addresses
  cadence: ScheduleCadence;
  created_by_user_id: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduleInput {
  organization_id: string;
  report_id: string;
  params?: Record<string, any>;
  format: ExportFormat;
  recipients: string[];
  cadence: ScheduleCadence;
  created_by_user_id: string;
}

class ReportSchedulerStore {
  private schedules: Map<string, ReportScheduleRecord> = new Map();

  public createSchedule(input: CreateScheduleInput): ReportScheduleRecord {
    if (!input.recipients || input.recipients.length === 0) {
      throw new Error('At least one recipient email address is required for a report schedule');
    }

    const id = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: ReportScheduleRecord = {
      id,
      organization_id: input.organization_id,
      report_id: input.report_id,
      params: input.params || {},
      format: input.format,
      recipients: input.recipients,
      cadence: input.cadence,
      created_by_user_id: input.created_by_user_id,
      last_run_at: null,
      next_run_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: now,
      updated_at: now,
    };

    this.schedules.set(id, record);
    return record;
  }

  public getSchedules(orgId: string): ReportScheduleRecord[] {
    return Array.from(this.schedules.values()).filter((s) => s.organization_id === orgId);
  }

  /**
   * Get a schedule by ID with optional organization scoping.
   * @param id The schedule ID
   * @param orgId Optional organization ID for cross-tenant isolation.
   *   When provided, returns the schedule only if its organization_id matches.
   *   When omitted, returns the schedule regardless of organization (for backward compatibility).
   * @returns The schedule record, or undefined if not found or org mismatch.
   */
  public getSchedule(id: string, orgId?: string): ReportScheduleRecord | undefined {
    const s = this.schedules.get(id);
    if (!s) return undefined;
    if (!orgId || s.organization_id === orgId) return s;
    return undefined;
  }

  public clearAll(): void {
    this.schedules.clear();
  }

  /**
   * SCHEDULED JOB RUNNER
   * Evaluates report schedules and dispatches reports via Layer 19 Email Provider.
   */
  public async runScheduledReportsJob(
    orgId: string,
    forceRunScheduleId?: string
  ): Promise<{ processedCount: number; emailsSentCount: number; errors: string[] }> {
    const schedules = this.getSchedules(orgId);
    let processedCount = 0;
    let emailsSentCount = 0;
    const errors: string[] = [];

    for (const sched of schedules) {
      if (forceRunScheduleId && sched.id !== forceRunScheduleId) continue;

      const reportDef = getReportDefinition(sched.report_id);
      if (!reportDef) {
        errors.push(`Report definition not found: ${sched.report_id}`);
        continue;
      }

      try {
        processedCount++;

        // 1. Generate Report via Shared Export Service
        const reportOutput = await sharedReportingService.generateReport(
          reportDef,
          sched.organization_id,
          sched.params,
          sched.format
        );

        // 2. Dispatch email to each recipient via Layer 19 TransactionalEmailProvider
        for (const recipientEmail of sched.recipients) {
          const sendRes = await TransactionalEmailProvider.sendEmail({
            toEmail: recipientEmail,
            subject: `[AIOSpark Scheduled Report] ${reportDef.name} (${reportOutput.format.toUpperCase()})`,
            body: `Attached is your scheduled ${sched.cadence} report "${reportDef.name}" generated on ${reportOutput.generatedAt}.\nRows included: ${reportOutput.rowCount}\nFile name: ${reportOutput.fileName}`,
            organizationId: sched.organization_id,
          });

          if (sendRes.success) {
            emailsSentCount++;
          } else {
            errors.push(`Email delivery failed for ${recipientEmail}: ${sendRes.errorDetail}`);
          }
        }

        // Update schedule last_run_at
        sched.last_run_at = new Date().toISOString();
        sched.updated_at = new Date().toISOString();
      } catch (err: any) {
        errors.push(`Failed executing schedule '${sched.id}': ${err.message}`);
      }
    }

    return { processedCount, emailsSentCount, errors };
  }
}

export const reportSchedulerStore = new ReportSchedulerStore();
