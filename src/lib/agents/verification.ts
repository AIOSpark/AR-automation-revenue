// AIOSpark Verification Module (Layer 17)
// Verifies agent outputs and distinguishes execution failures from verification failures.

export interface VerificationResult {
  verified: boolean;
  reason?: string;
  verifiedAt: string;
}

export class AgentVerificationEngine {
  /**
   * Post-execution verification step
   */
  public static async verifyOutput(
    agentName: string,
    outputData: any
  ): Promise<VerificationResult> {
    const verifiedAt = new Date().toISOString();

    if (!outputData) {
      return {
        verified: false,
        reason: 'Verification failed: Output data is null or undefined',
        verifiedAt,
      };
    }

    if (agentName === 'Receivables Analyst') {
      if (!outputData.summary_text || !Array.isArray(outputData.structured_data_points)) {
        return {
          verified: false,
          reason: 'Verification failed: AnalystReport missing summary_text or structured_data_points array',
          verifiedAt,
        };
      }
      return { verified: true, verifiedAt };
    }

    if (agentName === 'Investigation Agent') {
      if (!outputData.conclusion || !outputData.category || !Array.isArray(outputData.evidence)) {
        return {
          verified: false,
          reason: 'Verification failed: AIAnalysis missing required conclusion, category, or evidence array',
          verifiedAt,
        };
      }
      return { verified: true, verifiedAt };
    }

    // Default pass for stubs
    return { verified: true, verifiedAt };
  }
}
