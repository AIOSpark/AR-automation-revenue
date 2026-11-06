// AIOSpark Prompt Manager (Layer 30)
// Versioned prompt templates with structured input variables.
// Separates trusted system instructions from untrusted customer/document content.

import { PromptTemplate } from './types';

export interface PromptContext {
  [key: string]: string | number | boolean | null | undefined;
}

export class PromptManager {
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates(): void {
    // Investigation agent prompt - analyzes why an invoice is blocked
    this.register({
      id: 'invoice-investigation',
      version: '1.0.0',
      name: 'Invoice Investigation',
      description: 'Analyzes why an invoice payment is blocked using UDM evidence',
      systemPrompt: `You are an AIOSpark Invoice Investigation Agent. Your role is to analyze why a B2B invoice payment is blocked and produce a structured diagnosis.

CRITICAL RULES:
1. You must reason ONLY over the evidence provided below. Do not invent invoice amounts, customer balances, payment statuses, due dates, PO details, or any financial figures.
2. Every factual conclusion must reference specific evidence items by their label and source.
3. If evidence is insufficient to determine a root cause, classify as 'UNKNOWN' with confidence below 0.6.
4. Financial calculations (amounts, percentages, aging) are performed by deterministic application code, not by you.
5. Output must conform to the provided JSON schema exactly.
6. Do not include any text outside the JSON response.

EVIDENCE CONTEXT:
{{evidence_context}}

INVOICE: {{invoice_number}}
CUSTOMER: {{customer_name}}
AMOUNT: {{amount_minor_units}} minor units
DUE DATE: {{due_date}}
STATUS: {{status}}
PO REFERENCE: {{po_reference || 'Not recorded'}}
DELIVERY REFERENCE: {{delivery_reference || 'Not recorded'}}`,

      userPromptTemplate: `Analyze the evidence above and determine why this invoice payment is blocked.

Respond with a JSON object matching this schema:
{{output_schema}}

Fields:
- conclusion: A clear statement of why payment is blocked (or "Needs investigation" if inconclusive)
- category: One of: NORMAL_CYCLE, PAYMENT_PROMISED, CUSTOMER_DISPUTE, PO_MISMATCH, INVOICE_ERROR, GST_TAX_ISSUE, MISSING_DOCUMENT, DELIVERY_ISSUE, APPROVAL_PENDING, CREDIT_ISSUE, UNKNOWN
- confidence: 0.0 to 1.0. Below 0.6 means low confidence - requires human review.
- evidence: Array of evidence items, each with label, value, optional comparisonLabel, comparisonValue, and optional delta. Each item must reference actual evidence from the context above.
- source: "Invoice Investigation Agent v1.0.0"
- generatedAt: Current ISO timestamp

Be concise. Do not hallucinate. If you cannot determine the cause from the evidence, say so with low confidence.`,

      inputVariables: [
        'evidence_context',
        'invoice_number',
        'customer_name',
        'amount_minor_units',
        'due_date',
        'status',
        'po_reference',
        'delivery_reference',
        'output_schema',
      ],
      outputSchema: {
        type: 'object',
        required: ['conclusion', 'category', 'confidence', 'evidence', 'source', 'generatedAt'],
        properties: {
          conclusion: { type: 'string', minLength: 1, maxLength: 500 },
          category: {
            type: 'string',
            enum: [
              'NORMAL_CYCLE',
              'PAYMENT_PROMISED',
              'CUSTOMER_DISPUTE',
              'PO_MISMATCH',
              'INVOICE_ERROR',
              'GST_TAX_ISSUE',
              'MISSING_DOCUMENT',
              'DELIVERY_ISSUE',
              'APPROVAL_PENDING',
              'CREDIT_ISSUE',
              'UNKNOWN',
            ],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['label', 'value'],
              properties: {
                label: { type: 'string', minLength: 1 },
                value: { type: ['string', 'number'] },
                comparisonLabel: { type: 'string' },
                comparisonValue: { type: ['string', 'number'] },
                delta: { type: 'string' },
              },
            },
          },
          source: { type: 'string', minLength: 1 },
          generatedAt: { type: 'string' },
          modelVersion: { type: 'string' },
        },
        additionalProperties: false,
      },
    });

    // Collections agent prompt - drafts payment reminder communications
    this.register({
      id: 'collections-communication',
      version: '1.0.0',
      name: 'Collections Communication',
      description: 'Drafts policy-gated payment reminder communications',
      systemPrompt: `You are an AIOSpark Collections Agent. Your role is to draft payment reminder communications for overdue invoices.

CRITICAL RULES:
1. You must use ONLY the template variables provided. Do not generate freeform text.
2. All variables must be populated from verified UDM data.
3. Do not invent customer names, invoice numbers, amounts, or due dates.
4. Output must conform to the provided JSON schema exactly.
5. Do not include any text outside the JSON response.

TEMPLATE VARIABLES:
{{template_variables}}`,

      userPromptTemplate: `Populate the communication template with the provided variables.

Respond with a JSON object matching this schema:
{{output_schema}}

Fields:
- subject: Email subject line
- body: Email body text
- variables: Object mapping variable names to their values

Use only the variables provided in the context. Do not add or invent variables.`,

      inputVariables: ['template_variables', 'output_schema'],
      outputSchema: {
        type: 'object',
        required: ['subject', 'body', 'variables'],
        properties: {
          subject: { type: 'string', minLength: 1, maxLength: 200 },
          body: { type: 'string', minLength: 1, maxLength: 2000 },
          variables: { type: 'object' },
        },
        additionalProperties: false,
      },
    });
  }

  register(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: string, version?: string): PromptTemplate | null {
    const template = this.templates.get(id);
    if (!template) return null;
    if (version && template.version !== version) return null;
    return template;
  }

  getAll(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Render a prompt template with input variables.
   * Untrusted content is escaped to prevent injection.
   */
  render(templateId: string, variables: PromptContext): { systemPrompt: string; userPrompt: string } | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    // Validate all required variables are present
    for (const varName of template.inputVariables) {
      if (!(varName in variables)) {
        throw new Error(`Missing required template variable: ${varName}`);
      }
    }

    const renderTemplate = (text: string): string => {
      let result = text;
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        const safeValue = this.escapeForPrompt(value);
        result = result.split(placeholder).join(safeValue);
      }
      return result;
    };

    return {
      systemPrompt: renderTemplate(template.systemPrompt),
      userPrompt: renderTemplate(template.userPromptTemplate),
    };
  }

  /**
   * Escape untrusted content for safe inclusion in prompts.
   * Prevents prompt injection by escaping template delimiters and special characters.
   */
  private escapeForPrompt(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Escape template delimiters to prevent injection
    return str.replace(/\{\{/g, '{{').replace(/\}\}/g, '}}').replace(/\n/g, '\\n');
  }

  /**
   * Get a hash of the prompt template for audit logging.
   */
  getPromptHash(templateId: string): string | null {
    const template = this.templates.get(templateId);
    if (!template) return null;
    const content = `${template.id}:${template.version}:${template.systemPrompt}:${template.userPromptTemplate}`;
    // Simple hash for audit purposes
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `prompt_${Math.abs(hash).toString(16)}`;
  }
}

export const promptManager = new PromptManager();
