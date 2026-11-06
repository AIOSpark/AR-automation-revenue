// AIOSpark AI Analysis Interface Contract & Mock Data Provider (Layer 11)

export interface EvidenceItem {
  label: string; // e.g. "PO Quantity"
  value: string | number;
  comparisonLabel?: string; // e.g. "Invoice Quantity"
  comparisonValue?: string | number;
  delta?: string; // e.g. "50 units"
}

export interface AIAnalysis {
  conclusion: string; // e.g. "Invoice likely blocked by PO quantity mismatch"
  category: string; // e.g. "PO_MISMATCH"
  confidence: number; // 0.0 to 1.0
  evidence: EvidenceItem[]; // Structured comparison items, non-empty required
  source: string; // e.g. "PO comparison engine"
  generatedAt: string;
  modelVersion?: string | null;
}

/**
 * Mock provider offering realistic scenario analysis data
 */
export function getMockAIAnalysis(scenario: 'po_mismatch' | 'low_confidence' | 'no_analysis' | 'empty_evidence_fault'): AIAnalysis | null {
  if (scenario === 'no_analysis') {
    return null;
  }

  if (scenario === 'po_mismatch') {
    return {
      conclusion: 'Invoice payment blocked by PO quantity mismatch on Line 3',
      category: 'PO_MISMATCH',
      confidence: 0.95, // High confidence band (>0.9)
      evidence: [
        {
          label: 'PO Quantity',
          value: '950 units',
          comparisonLabel: 'Invoice Quantity',
          comparisonValue: '1,000 units',
          delta: '50 units overbilled',
        },
        {
          label: 'PO Line Price',
          value: '₹1,200.00 / unit',
          comparisonLabel: 'Invoice Line Price',
          comparisonValue: '₹1,200.00 / unit',
          delta: 'Price matched',
        },
      ],
      source: 'PO comparison engine',
      generatedAt: new Date().toISOString(),
      modelVersion: 'AIOSpark-O2C-v1.4',
    };
  }

  if (scenario === 'low_confidence') {
    return {
      conclusion: 'Possible delay due to unconfirmed buyer AP approval step',
      category: 'AP_APPROVAL_PENDING',
      confidence: 0.52, // Low confidence band (<0.6)
      evidence: [
        {
          label: 'Historical Approval Days',
          value: '14 days',
          comparisonLabel: 'Current Elapsed Days',
          comparisonValue: '18 days',
          delta: '+4 days variance',
        },
      ],
      source: 'Payment history pattern analysis',
      generatedAt: new Date().toISOString(),
      modelVersion: 'AIOSpark-O2C-v1.4',
    };
  }

  if (scenario === 'empty_evidence_fault') {
    // Malformed response with conclusion but empty evidence (Component must reject conclusion)
    return {
      conclusion: 'Malformed assertion without evidence',
      category: 'UNKNOWN',
      confidence: 0.98,
      evidence: [],
      source: 'Fault injector',
      generatedAt: new Date().toISOString(),
    };
  }

  return null;
}
