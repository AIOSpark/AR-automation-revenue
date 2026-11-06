// AIOSpark O2C Agent Control Plane Registry & Service (Layer 17, 18, 30)
// Central metadata repository and status resolver for all 6 specialized O2C AI Agents.

import { agentExecutorRegistry, AgentInvocationLog } from './executor';
import { approvalStore, ApprovalRequest } from '../approvals/store';
import { udmStore } from '../udm/store';
import { runReceivablesAnalyst } from './receivables-analyst';
import { runInvestigationAgent } from './investigation-agent';
import { runCollectionsAgent } from './collections-agent';
import { runCollectionsAgentStub, runDisputeAgentStub, runReconciliationAgentStub } from './stubs';

export interface AgentCapability {
  can: string[];
  cannot: string[];
}

export interface AgentPermission {
  roleRequired: string;
  actionTypesAllowed: string[];
  requiresApproval: boolean;
  approvalPolicy: string;
}

export interface AgentMetadata {
  id: string; // e.g. 'receivables-analyst'
  name: string; // e.g. 'Receivables Intelligence Agent'
  codeName: string; // e.g. 'Receivables Analyst'
  role: string;
  status: 'active' | 'recommendation_only' | 'pending_integration';
  purpose: string;
  capabilities: AgentCapability;
  permissions: AgentPermission;
  dataSources: string[];
  actionTriggers: string[];
  targetModule: string;
}

export interface AgentFleetMetrics {
  totalAgents: number;
  activeAgents: number;
  tasksExecutedToday: number;
  awaitingApprovalCount: number;
  policyBlockedCount: number;
}

export interface AgentDetailState {
  metadata: AgentMetadata;
  recentLogs: AgentInvocationLog[];
  pendingApprovals: ApprovalRequest[];
  stats: {
    totalRuns: number;
    successRate: number;
    actionsProposed: number;
    lastExecutedAt: string | null;
  };
}

export const O2C_AGENTS_REGISTRY: AgentMetadata[] = [
  {
    id: 'receivables-analyst',
    name: 'Receivables Intelligence Agent',
    codeName: 'Receivables Analyst',
    role: 'Portfolio Analyst',
    status: 'active',
    purpose: 'Performs non-disruptive portfolio-wide aging, risk distribution, and exception concentration analysis across receivables.',
    capabilities: {
      can: [
        'Analyze portfolio-wide aging trends and risk distributions',
        'Summarize top concentration risks and exception shifts',
        'Generate executive portfolio intelligence reports',
        'Provide non-blocking data insights to CFO and AR managers',
      ],
      cannot: [
        'Modify invoice balances or credit terms',
        'Send customer communications',
        'Approve or execute payment reconciliations',
        'Perform direct database mutations',
      ],
    },
    permissions: {
      roleRequired: 'Analyst / Owner',
      actionTypesAllowed: ['READ_RECEIVABLES_SUMMARY', 'GENERATE_PORTFOLIO_REPORT'],
      requiresApproval: false,
      approvalPolicy: 'Strict Read-Only Guarantee',
    },
    dataSources: ['UDM Invoices', 'UDM Customers', 'UDM Exceptions', 'Dashboard Aggregated Engine (Layer 9)'],
    actionTriggers: ['Scheduled Daily Portfolio Run', 'Manual Refresh Trigger', 'Executive Workspace Load'],
    targetModule: '/receivables',
  },
  {
    id: 'investigation-agent',
    name: 'Invoice Investigation Agent',
    codeName: 'Investigation Agent',
    role: 'Root-Cause Investigator',
    status: 'active',
    purpose: 'Investigates delayed or blocked invoices by comparing purchase orders, contracts, delivery notes, and tax records using Layer 13 Reasoning Engine.',
    capabilities: {
      can: [
        'Perform multi-scope root cause analysis for invoice blockages',
        'Parse delivery notes, PO line items, and contract terms',
        'Generate structured evidence trees with confidence scores',
        'Classify root causes using Layer 14 Locked Taxonomy (e.g. PO_MISMATCH)',
      ],
      cannot: [
        'Unilaterally resolve invoice disputes without review',
        'Alter invoice payment amounts or dates directly',
        'Send automated emails to customers without approval',
        'Bypass RBAC tenant boundaries',
      ],
    },
    permissions: {
      roleRequired: 'AR Manager / Owner',
      actionTypesAllowed: ['ANALYZE_INVOICE_CONTEXT', 'CLASSIFY_ROOT_CAUSE'],
      requiresApproval: false,
      approvalPolicy: 'Structured Reasoning Analysis Only',
    },
    dataSources: ['Layer 13 Reasoning Engine', 'UDM Invoices', 'UDM Disputes', 'Attached Documents'],
    actionTriggers: ['Exception Record Creation', 'Manual Re-Investigation Click', 'Invoice Detail Load'],
    targetModule: '/invoices',
  },
  {
    id: 'customer-intelligence-agent',
    name: 'Customer Intelligence Agent',
    codeName: 'Customer Intelligence Agent',
    role: 'Customer Risk & Pattern Specialist',
    status: 'active',
    purpose: 'Evaluates customer-level risk profiles, payment history consistency, broken promise trends, and multi-invoice disputes.',
    capabilities: {
      can: [
        'Analyze aggregated customer payment velocity and DSO history',
        'Evaluate broken Promise-to-Pay compliance rates',
        'Identify recurring dispute patterns across customer invoices',
        'Provide multi-invoice risk context for credit decision support',
      ],
      cannot: [
        'Change customer credit limits unilaterally',
        'Alter customer contact emails or addresses',
        'Discharge customer debts or grant waivers',
        'Bypass human review on high-risk customer actions',
      ],
    },
    permissions: {
      roleRequired: 'Credit Manager / Owner',
      actionTypesAllowed: ['ANALYZE_CUSTOMER_PROFILE', 'EVALUATE_CREDIT_RISK'],
      requiresApproval: false,
      approvalPolicy: 'Read-Only Intelligence Insights',
    },
    dataSources: ['UDM Customer Store', 'Layer 20 Promise Engine', 'Layer 12 Risk Engine', 'UDM Invoices'],
    actionTriggers: ['Customer 360 Open', 'Credit Review Trigger', 'Broken Promise Detection'],
    targetModule: '/customers',
  },
  {
    id: 'exception-investigation-agent',
    name: 'Exception Investigation Agent',
    codeName: 'Exception Investigation Agent',
    role: 'Exception Resolution Specialist',
    status: 'active',
    purpose: 'Formulates structured resolution proposals for active exception work items (PO Mismatches, Price Variance, Tax Disputes).',
    capabilities: {
      can: [
        'Investigate exception root causes via Layer 15 Exception Engine',
        'Formulate resolution proposals with supporting evidence',
        'Submit high-risk actions to Layer 18 Approval Center',
        'Track exception resolution status and verification',
      ],
      cannot: [
        'Execute write-offs or invoice adjustments without approval',
        'Bypass Layer 18 Mandatory Approval Floor',
        'Force close open exceptions without audit trail',
        'Exceed rate limits or policy bounds',
      ],
    },
    permissions: {
      roleRequired: 'Finance Manager / Owner',
      actionTypesAllowed: ['PROPOSE_EXCEPTION_RESOLUTION', 'ALTER_INVOICE_VALUE', 'RECLASSIFY_INVOICE'],
      requiresApproval: true,
      approvalPolicy: 'Mandatory Layer 18 Approval Floor',
    },
    dataSources: ['UDM Exceptions', 'Layer 14 Taxonomy Engine', 'Layer 18 Approval Store', 'Audit Logs'],
    actionTriggers: ['Exception Workspace Review', 'Investigation Resolution Trigger', 'Batch Exception Job'],
    targetModule: '/exceptions',
  },
  {
    id: 'collections-agent',
    name: 'Collections Intelligence Agent',
    codeName: 'Collections Agent',
    role: 'Automated Communications Specialist',
    status: 'active',
    purpose: 'Recommends strict, template-based payment reminders and document requests routed through Layer 18 Approval Queue.',
    capabilities: {
      can: [
        'Select and populate strict Layer 19 communication templates',
        'Calculate overdue days, balances, and customer contact parameters',
        'Propose SEND_CUSTOMER_COMMUNICATION actions to approval queue',
        'Log proposed communications in append-only audit store',
      ],
      cannot: [
        'Generate freeform unstructured AI text to customers',
        'Send emails directly without human approval',
        'Alter template variables outside defined schemas',
        'Contact unverified third-party addresses',
      ],
    },
    permissions: {
      roleRequired: 'Collections Specialist / Owner',
      actionTypesAllowed: ['SEND_CUSTOMER_COMMUNICATION', 'PROPOSE_PAYMENT_REMINDER'],
      requiresApproval: true,
      approvalPolicy: 'Unbypassable Communication Approval Floor',
    },
    dataSources: ['Layer 19 Communication Store', 'UDM Invoices', 'UDM Contacts', 'Approval Queue'],
    actionTriggers: ['Collections Workspace Run', 'Broken Promise Detection Event', 'Overdue Milestone Reach'],
    targetModule: '/collections',
  },
  {
    id: 'reconciliation-agent',
    name: 'Payment & Reconciliation Agent',
    codeName: 'Payment & Reconciliation Agent',
    role: 'Cash Application Specialist',
    status: 'active',
    purpose: 'Analyzes bank statement payloads, performs fuzzy invoice matching, and proposes payment allocations through Layer 18 Approval Floor.',
    capabilities: {
      can: [
        'Match bank deposits with open customer invoices using Layer 21 algorithms',
        'Identify short payments, bank fees, and split allocations',
        'Propose RECORD_PAYMENT_MATCH actions with confidence scores',
        'Audit match historical outcomes for Layer 29 AI quality feedback',
      ],
      cannot: [
        'Mutate cash balances or invoice statuses without human approval',
        'Bypass Layer 18 Mandatory Approval Floor even for 100% exact matches',
        'Create un-audited bank transactions',
        'Override organization GL accounting rules',
      ],
    },
    permissions: {
      roleRequired: 'Treasury / Controller / Owner',
      actionTypesAllowed: ['RECORD_PAYMENT_MATCH', 'PROPOSE_CASH_ALLOCATION'],
      requiresApproval: true,
      approvalPolicy: 'Mandatory Payment Match Approval Floor',
    },
    dataSources: ['Layer 21 Bank Adapter', 'UDM Invoices', 'UDM Payments', 'Historical Match Audits'],
    actionTriggers: ['Bank Statement Ingestion', 'Manual Match Re-Run', 'Unapplied Cash Queue Review'],
    targetModule: '/payments',
  },
];

export class AgentRegistryService {
  /**
   * Returns all 6 registered O2C Agents.
   */
  public static getAllAgents(): AgentMetadata[] {
    return [...O2C_AGENTS_REGISTRY];
  }

  /**
   * Retrieves single agent metadata by ID or codeName.
   */
  public static getAgentById(agentId: string): AgentMetadata | null {
    const norm = agentId.toLowerCase().trim();
    return (
      O2C_AGENTS_REGISTRY.find(
        (a) => a.id === norm || a.codeName.toLowerCase() === norm || a.name.toLowerCase() === norm
      ) || null
    );
  }

  /**
   * Computes real operational metrics across the active agent fleet for an organization.
   */
  public static getFleetMetrics(organizationId: string): AgentFleetMetrics {
    const logs = agentExecutorRegistry.getLogs(organizationId);
    const pendingApprovals = approvalStore.getRequests(organizationId, 'pending');

    const totalAgents = O2C_AGENTS_REGISTRY.length;
    const activeAgents = O2C_AGENTS_REGISTRY.filter((a) => a.status === 'active').length;
    const tasksExecutedToday = logs.length;
    const awaitingApprovalCount = pendingApprovals.length;
    const policyBlockedCount = logs.filter((l) => l.status === 'policy_denied').length;

    return {
      totalAgents,
      activeAgents,
      tasksExecutedToday,
      awaitingApprovalCount,
      policyBlockedCount,
    };
  }

  /**
   * Retrieves full state details for a specific agent.
   */
  public static getAgentDetail(agentId: string, organizationId: string): AgentDetailState | null {
    const metadata = this.getAgentById(agentId);
    if (!metadata) return null;

    const allLogs = agentExecutorRegistry.getLogs(organizationId);
    const recentLogs = allLogs
      .filter((l) => l.agentName.toLowerCase() === metadata.codeName.toLowerCase() || l.agentName === metadata.name)
      .slice(0, 15);

    const pendingApprovals = approvalStore
      .getRequests(organizationId, 'pending')
      .filter((r) => r.proposed_by.toLowerCase() === metadata.codeName.toLowerCase() || r.proposed_by === metadata.name);

    const agentLogs = allLogs.filter(
      (l) => l.agentName.toLowerCase() === metadata.codeName.toLowerCase() || l.agentName === metadata.name
    );
    const totalRuns = agentLogs.length;
    const successfulRuns = agentLogs.filter((l) => l.status === 'success').length;
    const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 100;
    const actionsProposed = agentLogs.filter((l) => l.proposedActionCreated).length;
    const lastExecutedAt = agentLogs.length > 0 ? agentLogs[0].timestamp : null;

    return {
      metadata,
      recentLogs,
      pendingApprovals,
      stats: {
        totalRuns,
        successRate,
        actionsProposed,
        lastExecutedAt,
      },
    };
  }

  /**
   * Runs an agent on-demand in a safe context based on agent ID.
   */
  public static async executeAgentTrigger(
    agentId: string,
    organizationId: string,
    payload?: Record<string, any>
  ) {
    const meta = this.getAgentById(agentId);
    if (!meta) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    udmStore.setTenantContext(organizationId);

    switch (meta.id) {
      case 'receivables-analyst':
        return await runReceivablesAnalyst(organizationId);

      case 'investigation-agent': {
        const invoices = udmStore.getInvoices();
        const targetInvoiceId = payload?.invoiceId || (invoices.length > 0 ? invoices[0].id : undefined);
        return await runInvestigationAgent({
          organizationId,
          invoiceId: targetInvoiceId,
          investigationType: 'invoice',
        });
      }

      case 'customer-intelligence-agent': {
        const customers = udmStore.getCustomers();
        const targetCustomerId = payload?.customerId || (customers.length > 0 ? customers[0].id : undefined);
        return await runInvestigationAgent({
          organizationId,
          customerId: targetCustomerId,
          investigationType: 'customer',
        });
      }

      case 'exception-investigation-agent': {
        const exceptions = udmStore.getExceptions();
        const targetExceptionId = payload?.exceptionId || (exceptions.length > 0 ? exceptions[0].id : undefined);
        return await runInvestigationAgent({
          organizationId,
          exceptionId: targetExceptionId,
          investigationType: 'exception',
        });
      }

      case 'collections-agent': {
        const invoices = udmStore.getInvoices();
        const targetInvoiceId = payload?.invoiceId || (invoices.length > 0 ? invoices[0].id : undefined);
        if (!targetInvoiceId) {
          return await runCollectionsAgentStub({ organizationId });
        }
        return await runCollectionsAgent({
          organizationId,
          invoiceId: targetInvoiceId,
          contentType: 'payment_reminder',
        });
      }

      case 'reconciliation-agent':
        return await runReconciliationAgentStub({ organizationId });

      default:
        throw new Error(`Unsupported execution trigger for agent: ${agentId}`);
    }
  }
}
