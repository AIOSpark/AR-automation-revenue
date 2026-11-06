// AIOSpark AI-Quality Feedback Loop Pipeline & Metrics (Layer 29)
// Computes classification accuracy, false positive rate, false negative rate, human override rates,
// and agent success rates per taxonomy category and aggregate over time.

import { ApprovalRequest } from '../approvals/store';

export type TaxonomyCategory =
  | 'NORMAL_CYCLE'
  | 'PAYMENT_PROMISED'
  | 'CUSTOMER_DISPUTE'
  | 'PO_MISMATCH'
  | 'INVOICE_ERROR'
  | 'GST_TAX_ISSUE'
  | 'MISSING_DOCUMENT'
  | 'DELIVERY_ISSUE'
  | 'APPROVAL_PENDING'
  | 'CREDIT_ISSUE'
  | 'UNKNOWN';

export const TAXONOMY_CATEGORIES: TaxonomyCategory[] = [
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
];

export type ReviewOutcome = 'approved' | 'rejected' | 'modified';

export interface LabeledOutcome {
  id: string;
  ai_analysis_id: string;
  organization_id: string;
  category: TaxonomyCategory;
  confidence_at_time: number;
  outcome: ReviewOutcome;
  modification_delta?: Record<string, any> | null;
  model_version: string;
  reviewed_at: string;
}

export interface CategoryQualityMetrics {
  category: TaxonomyCategory;
  total_reviewed: number;
  approved_unmodified: number;
  rejected: number;
  modified: number;
  accuracy_proxy: number; // approved / total_reviewed (0.0 - 1.0)
  human_override_rate: number; // (rejected + modified) / total_reviewed (0.0 - 1.0)
  false_positive_rate: number; // rejected / total_flagged_reviewed (for non-NORMAL_CYCLE)
  false_negative_rate: number; // estimated rate of unflagged invoices that were actually issues
  avg_confidence: number;
}

export interface AggregateQualitySummary {
  total_reviewed: number;
  total_approved: number;
  total_rejected: number;
  total_modified: number;
  overall_accuracy_proxy: number;
  overall_override_rate: number;
  category_breakdown: Record<TaxonomyCategory, CategoryQualityMetrics>;
}

export interface CategoryTrendPoint {
  period_label: string; // e.g. "2026-03-01" or "Day 1"
  override_rate: number;
  total_sample: number;
}

class AIQualityStore {
  private outcomes: LabeledOutcome[] = [];

  // --- RECORD LABELED OUTCOMES ---
  public recordOutcome(params: {
    ai_analysis_id?: string;
    organization_id: string;
    category: TaxonomyCategory | string;
    confidence_at_time: number;
    outcome: ReviewOutcome;
    modification_delta?: Record<string, any> | null;
    model_version?: string | null;
    reviewed_at?: string;
  }): LabeledOutcome {
    // Normalize category to exact TaxonomyCategory or default to UNKNOWN
    let normCategory: TaxonomyCategory = 'UNKNOWN';
    const upperCat = (params.category || '').toUpperCase();
    if (TAXONOMY_CATEGORIES.includes(upperCat as TaxonomyCategory)) {
      normCategory = upperCat as TaxonomyCategory;
    } else if (upperCat.includes('PO') || upperCat.includes('QUANTITY') || upperCat.includes('PRICE')) {
      normCategory = 'PO_MISMATCH';
    } else if (upperCat.includes('DISPUTE')) {
      normCategory = 'CUSTOMER_DISPUTE';
    } else if (upperCat.includes('APPROVAL')) {
      normCategory = 'APPROVAL_PENDING';
    } else if (upperCat.includes('PROMISE')) {
      normCategory = 'PAYMENT_PROMISED';
    } else if (upperCat.includes('GST') || upperCat.includes('TAX')) {
      normCategory = 'GST_TAX_ISSUE';
    }

    const outcome: LabeledOutcome = {
      id: `out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ai_analysis_id: params.ai_analysis_id || `analysis_${Date.now()}`,
      organization_id: params.organization_id,
      category: normCategory,
      confidence_at_time: params.confidence_at_time,
      outcome: params.outcome,
      modification_delta: params.modification_delta || null,
      model_version: params.model_version || 'AIOSpark-O2C-v1.4',
      reviewed_at: params.reviewed_at || new Date().toISOString(),
    };

    this.outcomes.push(outcome);
    return outcome;
  }

  /**
   * Pipeline ingestion helper from Layer 18 Approval Request
   */
  public recordFromApprovalRequest(
    req: ApprovalRequest,
    outcome: ReviewOutcome,
    modificationDelta?: Record<string, any>
  ): LabeledOutcome {
    // Extract category from evidence or proposed action
    let cat: string = (req.proposed_action?.category as string) || '';
    if (!cat && req.evidence && req.evidence.length > 0) {
      cat = req.evidence[0].category || req.evidence[0].label || '';
    }
    if (!cat) {
      cat = req.action_type || 'UNKNOWN';
    }

    return this.recordOutcome({
      ai_analysis_id: req.proposed_action?.ai_analysis_id || `analysis_${req.id}`,
      organization_id: req.organization_id,
      category: cat,
      confidence_at_time: req.confidence ?? 0.9,
      outcome,
      modification_delta: modificationDelta || req.modification || null,
      model_version: req.proposed_action?.model_version || 'AIOSpark-O2C-v1.4',
      reviewed_at: req.reviewed_at || new Date().toISOString(),
    });
  }

  public getOutcomes(orgId?: string): LabeledOutcome[] {
    if (orgId) return this.outcomes.filter((o) => o.organization_id === orgId);
    return [...this.outcomes];
  }

  // --- CATEGORY-LEVEL QUALITY METRICS CALCULATIONS ---
  public getCategoryMetrics(category: TaxonomyCategory, orgId?: string, timeWindowDays?: number): CategoryQualityMetrics {
    let list = this.outcomes.filter((o) => o.category === category);
    if (orgId) {
      list = list.filter((o) => o.organization_id === orgId);
    }
    if (timeWindowDays) {
      const cutoff = new Date(Date.now() - timeWindowDays * 24 * 3600 * 1000).toISOString();
      list = list.filter((o) => o.reviewed_at >= cutoff);
    }

    const total = list.length;
    if (total === 0) {
      return {
        category,
        total_reviewed: 0,
        approved_unmodified: 0,
        rejected: 0,
        modified: 0,
        accuracy_proxy: 0,
        human_override_rate: 0,
        false_positive_rate: 0,
        false_negative_rate: 0,
        avg_confidence: 0,
      };
    }

    const approved = list.filter((o) => o.outcome === 'approved').length;
    const rejected = list.filter((o) => o.outcome === 'rejected').length;
    const modified = list.filter((o) => o.outcome === 'modified').length;

    const accuracy_proxy = Number((approved / total).toFixed(4));
    const human_override_rate = Number(((rejected + modified) / total).toFixed(4));

    // False positive rate: Cases flagged as non-NORMAL_CYCLE issue that human rejected as not an issue
    const isFlaggedIssueCategory = category !== 'NORMAL_CYCLE' && category !== 'UNKNOWN';
    const false_positive_rate = isFlaggedIssueCategory
      ? Number((rejected / total).toFixed(4))
      : 0;

    // False negative rate: Approx from NORMAL_CYCLE/unflagged items that humans rejected/modified
    const false_negative_rate = category === 'NORMAL_CYCLE'
      ? Number(((rejected + modified) / total).toFixed(4))
      : 0;

    const avg_confidence = Number((list.reduce((acc, o) => acc + o.confidence_at_time, 0) / total).toFixed(4));

    return {
      category,
      total_reviewed: total,
      approved_unmodified: approved,
      rejected,
      modified,
      accuracy_proxy,
      human_override_rate,
      false_positive_rate,
      false_negative_rate,
      avg_confidence,
    };
  }

  /**
   * Aggregate Quality Summary across all 11 categories
   */
  public getAggregateSummary(orgId?: string, timeWindowDays?: number): AggregateQualitySummary {
    const category_breakdown = {} as Record<TaxonomyCategory, CategoryQualityMetrics>;

    let totalReviewed = 0;
    let totalApproved = 0;
    let totalRejected = 0;
    let totalModified = 0;

    for (const cat of TAXONOMY_CATEGORIES) {
      const met = this.getCategoryMetrics(cat, orgId, timeWindowDays);
      category_breakdown[cat] = met;
      totalReviewed += met.total_reviewed;
      totalApproved += met.approved_unmodified;
      totalRejected += met.rejected;
      totalModified += met.modified;
    }

    const overall_accuracy_proxy = totalReviewed > 0 ? Number((totalApproved / totalReviewed).toFixed(4)) : 0;
    const overall_override_rate = totalReviewed > 0 ? Number(((totalRejected + totalModified) / totalReviewed).toFixed(4)) : 0;

    return {
      total_reviewed: totalReviewed,
      total_approved: totalApproved,
      total_rejected: totalRejected,
      total_modified: totalModified,
      overall_accuracy_proxy,
      overall_override_rate,
      category_breakdown,
    };
  }

  /**
   * Trend tracking over time per category
   */
  public getCategoryTrends(category: TaxonomyCategory, orgId?: string, numBuckets: number = 7): CategoryTrendPoint[] {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    const trends: CategoryTrendPoint[] = [];

    for (let i = numBuckets - 1; i >= 0; i--) {
      const start = new Date(now - (i + 1) * dayMs).toISOString();
      const end = new Date(now - i * dayMs).toISOString();

      let bucketOutcomes = this.outcomes.filter(
        (o) => o.category === category && o.reviewed_at >= start && o.reviewed_at <= end
      );
      if (orgId) bucketOutcomes = bucketOutcomes.filter((o) => o.organization_id === orgId);

      const total = bucketOutcomes.length;
      const overrides = bucketOutcomes.filter((o) => o.outcome === 'rejected' || o.outcome === 'modified').length;

      trends.push({
        period_label: `T-${i}d`,
        override_rate: total > 0 ? Number((overrides / total).toFixed(4)) : 0,
        total_sample: total,
      });
    }

    return trends;
  }

  public clearAll(): void {
    this.outcomes = [];
  }
}

export const aiQualityStore = new AIQualityStore();
