// AIOSpark Hello World Toy AI Agent Implementation (Layer 35 Demonstration)
// Proves that adding a new AI Agent requires ZERO code changes to Layers 9-15 dashboards/UI.

import { AgentExecutor, AgentExecutionResult } from './executor';

export interface HelloAgentInput {
  name: string;
  organizationId: string;
}

export interface HelloAgentOutput {
  greeting: string;
  timestamp: string;
  confidence: number;
}

export async function runHelloAgent(
  input: HelloAgentInput
): Promise<AgentExecutionResult<HelloAgentOutput>> {
  return AgentExecutor.run<HelloAgentInput, HelloAgentOutput>(
    'Hello Agent',
    input.organizationId,
    input,
    async (params: HelloAgentInput) => {
      const modelCall = await AgentExecutor.callModel<HelloAgentOutput>(
        `Generate greeting for ${params.name}`,
        async () => ({
          greeting: `Hello ${params.name}, welcome to AIOSpark Autonomous O2C Intelligence!`,
          timestamp: new Date().toISOString(),
          confidence: 0.99,
        })
      );

      return {
        data: modelCall.result,
      };
    }
  );
}
