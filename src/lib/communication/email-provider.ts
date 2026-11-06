// AIOSpark Email Sender Gateway (Layer 19)
// Transactional email dispatch service with failure handling and sandbox test support.

import { SentMessage } from './store';

export interface SendEmailParams {
  toEmail: string;
  subject: string;
  body: string;
  organizationId: string;
  simulateFailure?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  errorDetail?: string;
}

export class TransactionalEmailProvider {
  private static isSandboxMode: boolean = true;

  public static setSandboxMode(enabled: boolean): void {
    this.isSandboxMode = enabled;
  }

  public static async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    if (!params.toEmail || !params.toEmail.includes('@')) {
      return {
        success: false,
        errorDetail: `Invalid recipient email address: '${params.toEmail}'`,
      };
    }

    if (params.simulateFailure) {
      return {
        success: false,
        errorDetail: 'Simulated transactional email provider SMTP 550 delivery failure',
      };
    }

    if (process.env.NODE_ENV === 'production') {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!apiKey || !from) {
        return { success: false, errorDetail: 'Transactional email provider is not configured.' };
      }

      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [params.toEmail],
            subject: params.subject,
            text: params.body,
          }),
        });
      } catch (error) {
        return {
          success: false,
          errorDetail: error instanceof Error ? `Email provider network error: ${error.message}` : 'Email provider network error.',
        };
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => 'Email provider rejected the request');
        return { success: false, errorDetail: `Email provider error (${response.status}): ${detail}` };
      }

      const payload = (await response.json()) as { id?: string };
      return { success: true, messageId: payload.id };
    }

    // Development-only sandbox delivery.
    const messageId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`[EMAIL DISPATCH - ${this.isSandboxMode ? 'SANDBOX' : 'PROD'}] To: ${params.toEmail} | Subject: "${params.subject}"`);

    return {
      success: true,
      messageId,
    };
  }
}
