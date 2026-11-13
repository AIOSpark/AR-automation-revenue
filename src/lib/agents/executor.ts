// AIOSpark Formal Agent Orchestration Runtime & LLM Encapsulation (Layer 17 & Layer 30)
// Formalizes AgentExecutor with shared 8-step safety pipeline middleware:
// permission check -> policy check -> data validation -> AI decision -> risk assessment -> approval requirement -> action -> verification.

import { AuditService } from '../audit/service';
import { billingStore } from '../billing/store';
import { policyEngine, PolicyContext } from './policy-engine';
import { AgentVerificationEngine } from './verification';
import { safetyMiddlewareEngine, SafetyPipelineContext } from './safety-middleware';
import { readSnapshot, writeSnapshot, deleteSnapshot } from '../db/durable-repository';
import { modelRouter } from '../llm/router';
import { parseAndValidateJSON } from '../llm/schema';
import { llmObservabilityStore, estimateCostUSD } from '../llm/observability';
import { LLMProvider } from '../llm/types';

export interface CallModelResult<T = any> {
  result: T;
  tokensUsed: number;
  estimatedCostUSD: number;
  model: string;
  provider: string;
  error?: string;
  errorCode?: string;
}

export interface AgentInvocationLog {
  invocationId: string;
  agentName: string;
  organizationId: string;
  input: Record<string, any>;
  timestamp: string;
  durationMs: number;
  status: 'success' | 'policy_denied' | 'execution_failed' | 'verification_failed' | 'timeout' | 'stub_logged';
  tokensUsed?: number;
  costUSD?: number;
  provider?: string;
  model?: string;
  proposedActionCreated?: boolean;
  resultSummary?: string;
  error?: string;
}

export interface AgentExecutionResult<T = any> {
  success: boolean;
  agentName: string;
  data: T;
  actionProposed: boolean;
  actionRecord?: any;
  log: AgentInvocationLog;
}

class AgentExecutorRegistry {
  private logs: AgentInvocationLog[] = readSnapshot<AgentInvocationLog[]>('agent_invocation_logs') || [];

  public setLLMConfig(config: { provider: string; model: string }): void {
    modelRouter.reconfigure([{ provider: config.provider as LLMProvider, model: config.model, priority: 1, isPrimary: true }]);
  }

  public logInvocation(log: AgentInvocationLog): void {
    this.logs.push(log);
    // Keep a bounded durable history for restart-safe operational visibility.
    if (this.logs.length > 10000) this.logs = this.logs.slice(-10000);
    writeSnapshot('agent_invocation_logs', this.logs);
  }

  public getLogs(orgId?: string): AgentInvocationLog[] {
    if (orgId) {
      return this.logs.filter((l) => l.organizationId === orgId);
    }
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    deleteSnapshot('agent_invocation_logs');
  }
}

export const agentExecutorRegistry = new AgentExecutorRegistry();

export class AgentExecutor {
  /**
   * Encapsulated LLM Call Gateway.
   * Agent modules MUST call this method instead of importing LLM SDK libraries directly.
   * Enforces structured output validation, token tracking, and observability.
   */
  public static async callModel<T = any>(
    prompt: string,
    fallbackOrOptions?: (() => Promise<T>) | {
      outputSchema?: Record<string, unknown>;
      temperature?: number;
      maxTokens?: number;
      organizationId?: string;
      agentId?: string;
      taskId?: string;
      promptId?: string;
      promptVersion?: string;
      promptHash?: string;
      provider?: LLMProvider;
      model?: string;
    }
  ): Promise<CallModelResult<T>> {
    const startMs = Date.now();

    // Backward compatibility: if second arg is a function, treat as fallback
    if (typeof fallbackOrOptions === 'function') {
      try {
        const fallbackResult = await fallbackOrOptions();
        return {
          result: fallbackResult,
          tokensUsed: 0,
          estimatedCostUSD: 0,
          model: 'fallback',
          provider: 'fallback',
        };
      } catch (err) {
        return {
          result: null as unknown as T,
          tokensUsed: 0,
          estimatedCostUSD: 0,
          model: 'fallback',
          provider: 'fallback',
        };
      }
    }

    const options = fallbackOrOptions;

    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant. Respond only with valid JSON matching the requested schema.' },
      { role: 'user' as const, content: prompt },
    ];

    let result;
    try {
      result = await modelRouter.invokeWithFallback(messages, {
        temperature: options?.temperature ?? 0.2,
        maxTokens: options?.maxTokens ?? 2000,
        responseFormat: options?.outputSchema ? { type: 'json_object' } : undefined,
        provider: options?.provider,
        model: options?.model,
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startMs;

      // Record failed invocation for observability
      if (options?.organizationId) {
        llmObservabilityStore.record({
          invocationId: `llm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          organizationId: options.organizationId,
          agentId: options.agentId || 'unknown',
          taskId: options.taskId || 'unknown',
          provider: options?.provider || 'openai',
          model: options?.model || 'unknown',
          promptId: options.promptId,
          promptVersion: options.promptVersion,
          promptHash: options.promptHash,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUSD: null,
          latencyMs,
          status: 'failure',
          errorCode: err?.code || 'UNKNOWN',
          timestamp: new Date().toISOString(),
        });
      }

      return {
        result: null as unknown as T,
        tokensUsed: 0,
        estimatedCostUSD: 0,
        model: options?.model || 'unknown',
        provider: options?.provider || 'openai',
        error: err instanceof Error ? err.message : 'LLM invocation threw an unexpected error',
        errorCode: (err as { code?: string })?.code || 'UNKNOWN',
      } as CallModelResult<T>;
    }

    const latencyMs = Date.now() - startMs;
    const response = result.response;

    if (!result.success || !response) {
      const latencyMs = Date.now() - startMs;

      // Record failed invocation for observability
      if (options?.organizationId) {
        llmObservabilityStore.record({
          invocationId: `llm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          organizationId: options.organizationId,
          agentId: options.agentId || 'unknown',
          taskId: options.taskId || 'unknown',
          provider: options?.provider || 'openai',
          model: options?.model || 'unknown',
          promptId: options.promptId,
          promptVersion: options.promptVersion,
          promptHash: options.promptHash,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUSD: null,
          latencyMs,
          status: 'failure',
          errorCode: result.errorCode || 'UNKNOWN',
          timestamp: new Date().toISOString(),
        });
      }

      return {
        result: null as unknown as T,
        tokensUsed: 0,
        estimatedCostUSD: 0,
        model: options?.model || 'unknown',
        provider: options?.provider || 'openai',
        error: result.error || 'LLM provider returned no response',
        errorCode: result.errorCode || 'UNKNOWN',
      } as CallModelResult<T>;
    }

    // Validate structured output if schema provided
    let parsedResult: unknown;
    if (options?.outputSchema) {
      const validation = parseAndValidateJSON(response.content || '', options.outputSchema);
      if (!validation.success) {
        const latencyMs = Date.now() - startMs;

        // Record failed invocation for observability
        if (options?.organizationId) {
          llmObservabilityStore.record({
            invocationId: `llm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            organizationId: options.organizationId,
            agentId: options.agentId || 'unknown',
            taskId: options.taskId || 'unknown',
          provider: options?.provider || response.provider,
          model: response.model,
          promptId: options.promptId,
          promptVersion: options.promptVersion,
          promptHash: options.promptHash,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          totalTokens: response.totalTokens,
          estimatedCostUSD: estimateCostUSD(response.model, response.inputTokens, response.outputTokens),
          latencyMs,
          status: 'failure',
          errorCode: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      return {
        result: null as unknown as T,
        tokensUsed: response.totalTokens,
        estimatedCostUSD: estimateCostUSD(response.model, response.inputTokens, response.outputTokens) || 0,
        model: response.model,
        provider: response.provider,
        error: `Structured output validation failed: ${validation.errors
          .slice(0, 3)
          .map((e) => `${e.path || 'root'}: ${e.message}`)
          .join('; ')} | response preview: ${
          response.content ? response.content.slice(0, 200) : '<empty>'
        }`,
        errorCode: 'VALIDATION_ERROR',
      } as CallModelResult<T>;
      }
      parsedResult = validation.data;
    } else {
      // No schema - try to parse as JSON, fall back to raw text
      try {
        parsedResult = JSON.parse(response.content || '{}');
      } catch {
        parsedResult = { rawResponse: response.content };
      }
    }

    const estimatedCost = estimateCostUSD(response.model, response.inputTokens, response.outputTokens);

    // Record successful invocation for observability
    if (options?.organizationId) {
      llmObservabilityStore.record({
        invocationId: `llm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        organizationId: options.organizationId,
        agentId: options.agentId || 'unknown',
        taskId: options.taskId || 'unknown',
        provider: response.provider,
        model: response.model,
        promptId: options.promptId,
        promptVersion: options.promptVersion,
        promptHash: options.promptHash,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.totalTokens,
        estimatedCostUSD: estimatedCost,
        latencyMs,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      result: parsedResult as T,
      tokensUsed: response.totalTokens,
      estimatedCostUSD: estimatedCost || 0,
      model: response.model,
      provider: response.provider,
    };
  }

  /**
   * Primary entry point for invoking ANY AI Agent in AIOSpark.
   * Enforces the 8-step safety pipeline automatically for every agent.
   */
  public static async run<TInput = any, TOutput = any>(
    agentName: string,
    organizationId: string,
    input: TInput,
    agentLogicFn: (input: TInput, signal?: AbortSignal) => Promise<{
      data: TOutput;
      proposedAction?: {
        targetEntity: string;
        targetId: string;
        actionType: string;
        payload: Record<string, any>;
      };
    }>,
    options?: {
      policyContext?: PolicyContext;
      userRole?: string;
      timeoutMs?: number;
      maxRetries?: number;
    }
  ): Promise<AgentExecutionResult<TOutput>> {
    const invocationId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startMs = Date.now();
    const timestamp = new Date().toISOString();
    const timeoutMs = options?.timeoutMs || 5000;

    const configuredRoute = modelRouter.getRoutes()[0];
    const log: AgentInvocationLog = {
      invocationId,
      agentName,
      organizationId,
      input: (input as Record<string, any>) || {},
      timestamp,
      durationMs: 0,
      status: 'success',
      provider: configuredRoute?.provider || 'openai',
      model: configuredRoute?.model || 'unknown',
      tokensUsed: 0,
      costUSD: 0,
    };

    // Wire Layer 27 Usage Tracking Event
    billingStore.recordEvent({
      organization_id: organizationId,
      event_type: 'agent_execution',
      quantity: 1,
      metadata: { agent_name: agentName, model: configuredRoute?.model || 'unknown', provider: configuredRoute?.provider || 'openai' },
    });

    const pipelineCtx: SafetyPipelineContext = {
      organizationId,
      agentName,
      userRole: options?.userRole || options?.policyContext?.userRole || 'Admin',
      targetEntity: (input as any)?.targetEntity || (input as any)?.invoice_id ? 'invoice' : undefined,
      targetId: (input as any)?.targetId || (input as any)?.invoice_id,
      payload: (input as any)?.payload,
    };

    try {
      // --- STEP 1: PERMISSION CHECK (RBAC) ---
      const permCheck = safetyMiddlewareEngine.checkPermission(pipelineCtx);
      if (!permCheck.passed) {
        log.status = 'policy_denied';
        log.durationMs = Date.now() - startMs;
        log.error = permCheck.detail;
        log.resultSummary = `Permission check failed: ${permCheck.detail}`;
        agentExecutorRegistry.logInvocation(log);

        return {
          success: false,
          agentName,
          data: null as any,
          actionProposed: false,
          log,
        };
      }

      // --- STEP 2: POLICY CHECK ---
      const policyCheck = safetyMiddlewareEngine.checkPolicy(pipelineCtx);
      if (!policyCheck.passed) {
        log.status = 'policy_denied';
        log.durationMs = Date.now() - startMs;
        log.error = policyCheck.detail;
        log.resultSummary = `Policy check failed: ${policyCheck.detail}`;
        agentExecutorRegistry.logInvocation(log);

        return {
          success: false,
          agentName,
          data: null as any,
          actionProposed: false,
          log,
        };
      }

      // --- STEP 3: DATA VALIDATION (BEFORE AI DECISION) ---
      const dataValCheck = safetyMiddlewareEngine.validateData(pipelineCtx);
      if (!dataValCheck.passed) {
        log.status = 'execution_failed';
        log.durationMs = Date.now() - startMs;
        log.error = dataValCheck.detail;
        log.resultSummary = `Data validation failed: ${dataValCheck.detail}`;
        agentExecutorRegistry.logInvocation(log);

        return {
          success: false,
          agentName,
          data: null as any,
          actionProposed: false,
          log,
        };
      }

      // --- STEP 4: AI DECISION (RUN AGENT LOGIC WITH TIMEOUT) ---
      const runWithTimeout = async () => {
        const retryMax = options?.maxRetries || 2;
        let lastErr: any = null;

        for (let attempt = 0; attempt < retryMax; attempt++) {
          const controller = new AbortController();
          let timeoutHandle: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              controller.abort();
              reject(new Error(`Agent execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          });
          try {
            const execPromise = agentLogicFn(input, controller.signal);
            const res = await Promise.race([execPromise, timeoutPromise]);
            return res;
          } catch (err: any) {
            lastErr = err;
            if (err.message && err.message.includes('timed out')) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
          }
        }
        throw lastErr || new Error('Agent execution failed after retries');
      };

      const result = await runWithTimeout();

      let actionProposed = false;
      let actionRecord: any = undefined;

      // --- STEP 5, 6, 7 IF ACTION PROPOSED ---
      if (result.proposedAction) {
        const enrichedCtx: SafetyPipelineContext = {
          ...pipelineCtx,
          targetEntity: result.proposedAction.targetEntity,
          targetId: result.proposedAction.targetId,
          actionType: result.proposedAction.actionType,
          payload: result.proposedAction.payload,
          evidence: (result.data as any)?.evidence || [],
          confidence: (result.data as any)?.confidence ?? 0.95,
          amountMinorUnits: (result.proposedAction.payload as any)?.amount_minor_units || (result.proposedAction.payload as any)?.value,
        };

        // Step 3 Re-validation for proposed action target
        const propDataCheck = safetyMiddlewareEngine.validateData(enrichedCtx);
        if (!propDataCheck.passed) {
          log.status = 'execution_failed';
          log.durationMs = Date.now() - startMs;
          log.error = propDataCheck.detail;
          log.resultSummary = `Proposed action data validation failed: ${propDataCheck.detail}`;
          agentExecutorRegistry.logInvocation(log);

          return {
            success: false,
            agentName,
            data: result.data,
            actionProposed: true,
            log,
          };
        }

        // Deduplicate every proposed action, including actions that are
        // currently allowed to execute without approval. Previously this
        // guard only ran on the approval branch, so a rapid double-click on a
        // normal reminder could execute twice.
        const dupCheck = await safetyMiddlewareEngine.checkDoubleExecution(enrichedCtx);
        if (dupCheck.isDuplicate) {
          log.status = 'execution_failed';
          log.durationMs = Date.now() - startMs;
          log.error = `Double-Execution Intercepted: Duplicate request for action '${result.proposedAction.actionType}' on target '${result.proposedAction.targetId}' in 5s window.`;
          agentExecutorRegistry.logInvocation(log);

          return {
            success: false,
            agentName,
            data: result.data,
            actionProposed: true,
            log,
          };
        }

        // Step 5: Risk Assessment Evaluation (Non-Bypassable Hardcoded Product Floor)
        const riskAssess = safetyMiddlewareEngine.evaluateRiskAssessment(enrichedCtx);

        // Step 5 Re-Policy Check after risk evaluation
        const policyResult = policyEngine.checkPolicy(
          organizationId,
          agentName,
          result.proposedAction.actionType,
          {
            ...(options?.policyContext || {}),
            subjectType: result.proposedAction.targetEntity,
            subjectId: result.proposedAction.targetId,
            payload: result.proposedAction.payload,
            evidence: (result.data as any)?.evidence || [],
            confidence: (result.data as any)?.confidence ?? 0.95,
          }
        );

        // Step 6: ALL proposed actions must route through the approval center by default.
        // The executed bypass-path below is only reached for explicitly configured
        // no-approval-actions; the test suite and security requirements mandate
        // approval gating for all agent-proposed financial actions.
        if (riskAssess.requiresApproval || !policyResult.allowed) {
          log.status = 'policy_denied';
          log.durationMs = Date.now() - startMs;
          log.error = riskAssess.riskReasons.join(' ') || policyResult.reason;
          log.resultSummary = `Action '${result.proposedAction.actionType}' routed to approval center due to risk guardrails: ${log.error}`;
          agentExecutorRegistry.logInvocation(log);

          const approvalReqId = policyResult.approvalRequestId || `appr_risk_${Date.now()}`;

          AuditService.record({
            organization_id: organizationId,
            actor_user_id: null,
            actor_type: 'agent',
            action_type: `agent.proposed_${result.proposedAction.actionType.toLowerCase()}`,
            subject_type: result.proposedAction.targetEntity,
            subject_id: result.proposedAction.targetId,
            after_state: { proposed_action: result.proposedAction, risk_reasons: riskAssess.riskReasons },
            ai_context: {
              agent_name: agentName,
              confidence: (result.data as any)?.confidence ?? 0.95,
              evidence: (result.data as any)?.evidence || [],
            },
            approval_context: { approval_request_id: approvalReqId, status: 'pending' },
            result: 'success',
          });

          return {
            success: false,
            agentName,
            data: null as any,
            actionProposed: true,
            actionRecord: {
              id: approvalReqId,
              status: 'pending_approval',
              riskReasons: riskAssess.riskReasons,
            },
            log,
          };
        }

        // Explicit no-approval path: only reached when both riskAssess.requiresApproval
        // is false AND policyResult.allowed is true. This requires explicit
        // configuration marking the action as bypass-approved.
        actionProposed = true;
        actionRecord = {
          id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          organization_id: organizationId,
          target_entity: result.proposedAction.targetEntity,
          target_id: result.proposedAction.targetId,
          action_type: result.proposedAction.actionType,
          payload: result.proposedAction.payload,
          status: 'pending_approval',
          created_at: new Date().toISOString(),
        };
        log.proposedActionCreated = true;
      }

      // --- STEP 8: VERIFICATION STEP ---
      const verification = await AgentVerificationEngine.verifyOutput(agentName, result.data);
      if (!verification.verified) {
        log.status = 'verification_failed';
        log.durationMs = Date.now() - startMs;
        log.error = verification.reason;
        log.resultSummary = `Verification failed: ${verification.reason}`;
        agentExecutorRegistry.logInvocation(log);

        return {
          success: false,
          agentName,
          data: result.data,
          actionProposed,
          actionRecord,
          log,
        };
      }

      log.status = 'success';
      log.durationMs = Date.now() - startMs;
      log.resultSummary = `Executed & verified successfully through 8-step safety pipeline. Action proposed: ${actionProposed}`;
      agentExecutorRegistry.logInvocation(log);

      return {
        success: true,
        agentName,
        data: result.data,
        actionProposed,
        actionRecord,
        log,
      };
    } catch (err: any) {
      log.durationMs = Date.now() - startMs;
      const isTimeout = err?.message?.includes('timed out');
      log.status = isTimeout ? 'timeout' : 'execution_failed';
      log.error = err?.message || String(err);
      log.resultSummary = `Failed execution (${log.status}): ${log.error}`;
      agentExecutorRegistry.logInvocation(log);

      return {
        success: false,
        agentName,
        data: null as any,
        actionProposed: false,
        log,
      };
    }
  }
}
