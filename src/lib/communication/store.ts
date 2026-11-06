// AIOSpark Communication Engine Data Models & Store (Layer 19)

import { AuditService } from '../audit/service';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export type CommunicationContentType = 'payment_reminder' | 'document_request' | 'dispute_clarification';
export type CommunicationChannel = 'email';
export type SentMessageStatus = 'sent' | 'failed';

export interface MessageTemplate {
  id: string;
  organization_id: string;
  content_type: CommunicationContentType;
  subject_template: string;
  body_template: string;
  created_at: string;
  updated_at: string;
}

export interface SentMessage {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id?: string | null;
  exception_id?: string | null;
  content_type: CommunicationContentType;
  channel: CommunicationChannel;
  subject: string;
  body: string; // Exact final content sent
  approval_request_id: string;
  sent_at: string;
  status: SentMessageStatus;
  error_detail?: string | null;
}

export interface PopulateTemplateParams {
  organization_id: string;
  content_type: CommunicationContentType;
  variables: Record<string, any>;
}

// DEFAULT TEMPLATE SEEDS
const DEFAULT_TEMPLATES: Array<Omit<MessageTemplate, 'id' | 'created_at' | 'updated_at'>> = [
  {
    organization_id: '*',
    content_type: 'payment_reminder',
    subject_template: 'Payment Reminder: Outstanding Invoice {{invoice_number}} for {{customer_name}}',
    body_template:
      'Dear {{customer_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{amount}} was due on {{due_date}} and is currently {{days_overdue}} days overdue.\n\nPlease arrange for payment at your earliest convenience.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
  },
  {
    organization_id: '*',
    content_type: 'document_request',
    subject_template: 'Action Required: {{document_type}} needed for Invoice {{invoice_number}}',
    body_template:
      'Dear {{customer_name}},\n\nIn order to process payment resolution for invoice {{invoice_number}}, we require a copy of the {{document_type}}.\n\nPlease reply to this email with the requested document attached.\n\nThank you,\n{{sender_name}}\n{{company_name}}',
  },
  {
    organization_id: '*',
    content_type: 'dispute_clarification',
    subject_template: 'Dispute Clarification Request: Invoice {{invoice_number}}',
    body_template:
      'Dear {{customer_name}},\n\nRegarding the dispute raised on invoice {{invoice_number}} with stated reason: "{{dispute_reason}}".\n\nWe kindly request the following clarification or next step: {{requested_clarification}}.\n\nSincerely,\n{{sender_name}}\n{{company_name}}',
  },
];

class CommunicationStore {
  private templates: Map<string, MessageTemplate> = new Map();
  private sentMessages: Map<string, SentMessage> = new Map();

  constructor() {
    const state = readSnapshot<{ templates: MessageTemplate[]; sentMessages: SentMessage[] }>('communication');
    this.templates = new Map((state?.templates || []).map((template) => [template.id, template]));
    this.sentMessages = new Map((state?.sentMessages || []).map((message) => [message.id, message]));
    if (this.templates.size === 0) this.seedDefaultTemplates('*');
  }

  private persist(): void {
    writeSnapshot('communication', {
      templates: Array.from(this.templates.values()),
      sentMessages: Array.from(this.sentMessages.values()),
    });
  }

  public seedDefaultTemplates(orgId: string): void {
    const now = new Date().toISOString();
    DEFAULT_TEMPLATES.forEach((tpl) => {
      const id = `tpl_${tpl.content_type}_${orgId === '*' ? 'global' : orgId}`;
      this.templates.set(id, {
        ...tpl,
        id,
        organization_id: orgId,
        created_at: now,
        updated_at: now,
      });
    });
    this.persist();
  }

  public getTemplate(orgId: string, contentType: CommunicationContentType): MessageTemplate | null {
    const all = Array.from(this.templates.values());
    const orgMatch = all.find((t) => t.organization_id === orgId && t.content_type === contentType);
    if (orgMatch) return orgMatch;
    const globalMatch = all.find((t) => t.organization_id === '*' && t.content_type === contentType);
    return globalMatch || null;
  }

  public saveTemplate(template: Omit<MessageTemplate, 'id' | 'created_at' | 'updated_at'>): MessageTemplate {
    const now = new Date().toISOString();
    const existing = this.getTemplate(template.organization_id, template.content_type);
    const id = existing ? existing.id : `tpl_${template.content_type}_${Date.now()}`;

    const record: MessageTemplate = {
      ...template,
      id,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
    };
    this.templates.set(id, record);
    this.persist();
    return record;
  }

  /**
   * STRICT TEMPLATE VARIABLE SUBSTITUTION ENGINE
   * Refuses to generate malformed content if a required variable is missing or empty.
   */
  public populateTemplate(params: PopulateTemplateParams): { subject: string; body: string } {
    const template = this.getTemplate(params.organization_id, params.content_type);
    if (!template) {
      throw new Error(`Template not found for organization ${params.organization_id} and content type ${params.content_type}`);
    }

    const { variables } = params;

    // Helper substitution & missing variable check
    const substitute = (text: string): string => {
      return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const val = variables[key];
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          throw new Error(`Missing required template variable '${key}' for content type '${params.content_type}'`);
        }
        return String(val);
      });
    };

    const subject = substitute(template.subject_template);
    const body = substitute(template.body_template);

    return { subject, body };
  }

  public logSentMessage(data: Omit<SentMessage, 'id' | 'sent_at'>): SentMessage {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: SentMessage = {
      ...data,
      id,
      sent_at: now,
    };
    this.sentMessages.set(id, record);
    this.persist();

    // Wire into Layer 26 Audit Log
    AuditService.record({
      organization_id: data.organization_id,
      actor_user_id: null,
      actor_type: 'agent',
      action_type: 'message.sent',
      subject_type: data.invoice_id ? 'invoice' : 'customer',
      subject_id: data.invoice_id || data.customer_id,
      after_state: {
        message_id: id,
        content_type: data.content_type,
        channel: data.channel,
        subject: data.subject,
        status: data.status,
      },
      approval_context: { approval_request_id: data.approval_request_id, status: 'approved' },
      result: data.status === 'sent' ? 'success' : 'failure',
    });

    return record;
  }

  public getSentMessages(orgId: string, customerId?: string): SentMessage[] {
    const list = Array.from(this.sentMessages.values()).filter((m) => m.organization_id === orgId);
    if (customerId) {
      return list.filter((m) => m.customer_id === customerId);
    }
    return list;
  }

  public clearAll(): void {
    this.templates.clear();
    this.sentMessages.clear();
    deleteSnapshot('communication');
    this.seedDefaultTemplates('*');
  }
}

export const communicationStore = new CommunicationStore();
