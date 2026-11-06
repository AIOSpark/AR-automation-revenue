import { AgentExecutor, AgentExecutionResult } from './executor';
import { runCollectionsAgent } from './collections-agent';

export interface StubAgentInput {
  organizationId: string;
  targetId?: string;
  notes?: string;
}

export interface StubAgentOutput {
  status: 'stub_logged' | 'active';
  message: string;
  requiredLayer?: string;
}

export { runCollectionsAgent };

/**
 * Agent 3 — Collections Agent (Delegated to active Layer 19 implementation)
 */
export async function runCollectionsAgentStub(
  input: StubAgentInput
): Promise<AgentExecutionResult<StubAgentOutput>> {
  if (input.targetId) {
    const res = await runCollectionsAgent({
      organizationId: input.organizationId,
      invoiceId: input.targetId,
    });
    return {
      success: res.success,
      agentName: res.agentName,
      data: {
        status: 'active',
        message: 'Collections Agent active — template reminder proposed',
      },
      actionProposed: res.actionProposed,
      actionRecord: res.actionRecord,
      log: res.log,
    };
  }

  return AgentExecutor.run<StubAgentInput, StubAgentOutput>(
    'Collections Agent',
    input.organizationId,
    input,
    async () => {
      const message = 'Collections Agent active — ready for invoice triggers';
      return {
        data: {
          status: 'active',
          message,
        },
      };
    }
  );
}

/**
 * Agent 4 — Dispute Agent (Scaffold Stub)
 * Recommended action only, depends on future Dispute workflow layers.
 * Note: Dispute Agent remains recommendation-only even once built given legal/contractual nuance.
 */
export async function runDisputeAgentStub(
  input: StubAgentInput
): Promise<AgentExecutionResult<StubAgentOutput>> {
  return AgentExecutor.run<StubAgentInput, StubAgentOutput>(
    'Dispute Agent',
    input.organizationId,
    input,
    async () => {
      const message = 'Dispute Agent not yet active — Recommendation-only agent pending legal/dispute workflows';
      console.log(`[STUB] ${message}`);
      return {
        data: {
          status: 'stub_logged',
          message,
          requiredLayer: 'Layer 18/20 (Dispute Management)',
        },
      };
    }
  );
}

/**
 * Agent 5 — Reconciliation Agent (Scaffold Stub)
 * Depends on Layer 21 (Payment Reconciliation)
 */
export async function runReconciliationAgentStub(
  input: StubAgentInput
): Promise<AgentExecutionResult<StubAgentOutput>> {
  return AgentExecutor.run<StubAgentInput, StubAgentOutput>(
    'Reconciliation Agent',
    input.organizationId,
    input,
    async () => {
      const message = 'Reconciliation Agent not yet active — Payment Reconciliation (Layer 21) required';
      console.log(`[STUB] ${message}`);
      return {
        data: {
          status: 'stub_logged',
          message,
          requiredLayer: 'Layer 21 (Payment Reconciliation)',
        },
      };
    }
  );
}
