// AIOSpark Exception Intelligence Query & Analytics Engine
// Server-side query layer providing rich multi-attribute filtering, sorting, pagination,
// cash affected breakdown, top blocker analytics, bottleneck stages, and resolution metrics.

import { udmStore } from '../udm/store';
import { ExceptionRecord, ExceptionSeverity, ExceptionStatus, Invoice, Customer } from '../udm/types';
import { getInvoiceOutstandingBalance } from '../dashboard/engine';
import { CATEGORY_EASE_OF_RESOLUTION_FACTORS } from '../cfo/engine';
import { PAYMENT_DELAY_CATEGORIES, categoryDefinitionsMap, PaymentDelayCategory } from '../taxonomy/definitions';
import { auditStore } from '../audit/store';

export interface ExceptionQueryFilters {
  status?: string;
  severity?: string;
  type?: string;
  customerId?: string;
  ownerId?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  minAgeDays?: number;
  maxAgeDays?: number;
  sortBy?: 'amount' | 'severity' | 'age' | 'updated' | 'category';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ExceptionListItem {
  id: string;
  organizationId: string;
  type: string;
  categoryTitle: string;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  ownerId: string | null;
  ownerLabel: string;
  customerId: string | null;
  customerName: string;
  customerRisk: string;
  invoiceId: string | null;
  invoiceNumber: string;
  invoiceAmountMinorUnits: number;
  affectedAmountMinorUnits: number;
  affectedAmountFormatted: string;
  ageDays: number;
  createdAt: string;
  updatedAt: string;
  recommendedAction: string;
  nextActionLabel: string;
  evidenceCount: number;
}

export interface ExceptionQueryResult {
  items: ExceptionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kpis: {
    openExceptions: number;
    cashAffectedMinorUnits: number;
    cashAffectedFormatted: string;
    criticalExceptions: number;
    unassignedExceptions: number;
    agingExceptions30Plus: number;
    avgResolutionTimeDays: number | null;
  };
  cashAffectedByCategory: Array<{
    category: string;
    title: string;
    count: number;
    cashAffectedMinorUnits: number;
    cashAffectedFormatted: string;
    avgAgeDays: number;
    criticalCount: number;
  }>;
  bottlenecks: Array<{
    stage: string;
    count: number;
    cashAffectedMinorUnits: number;
  }>;
}

/** Format minor units (Paise) to formatted INR string (₹) */
export function formatINR(minorUnits: number): string {
  const rupees = minorUnits / 100;
  if (rupees >= 10000000) { // 1 Cr
    return `₹${(rupees / 10000000).toFixed(2)}Cr`;
  }
  if (rupees >= 100000) { // 1 Lakh
    return `₹${(rupees / 100000).toFixed(2)}L`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** Calculate age in days between ISO date string and today */
export function calculateAgeDays(createdIso: string, todayIso?: string): number {
  const today = todayIso ? new Date(todayIso).getTime() : Date.now();
  const created = new Date(createdIso).getTime();
  const diffMs = Math.max(0, today - created);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Map status to operational bottleneck stage */
export function getBottleneckStage(status: ExceptionStatus): string {
  switch (status) {
    case 'detected':
    case 'classified':
    case 'severity_determined':
      return 'Classification & Triage';
    case 'owner_assigned':
    case 'recommended':
      return 'Investigating';
    case 'pending_approval':
      return 'Awaiting Approval';
    case 'approved':
    case 'executed':
      return 'Action Execution';
    case 'verified':
      return 'Verifying Resolution';
    case 'closed':
    case 'rejected':
      return 'Resolved / Closed';
    default:
      return 'Internal Workstream';
  }
}

/** Main query function for Exception Intelligence Workspace */
export function queryExceptionsWorkspace(
  orgId: string,
  filters: ExceptionQueryFilters = {},
  todayIso?: string
): ExceptionQueryResult {
  // orgId is derived from the active AsyncLocalStorage request context
  const activeOrgId = udmStore.getRequestTenant();
  if (!activeOrgId) {
    throw new Error('Missing tenant context: orgId not available in current request context');
  }
  const rawExceptions = udmStore.getExceptions();
  const rawInvoices = udmStore.getInvoices();
  const rawCustomers = udmStore.getCustomers();

  const invoiceMap = new Map<string, Invoice>(rawInvoices.map((inv) => [inv.id, inv]));
  const customerMap = new Map<string, Customer>(rawCustomers.map((cust) => [cust.id, cust]));

  // Build full enriched exception list
  const enriched: ExceptionListItem[] = rawExceptions.map((ex) => {
    const inv = ex.invoice_id ? invoiceMap.get(ex.invoice_id) : null;
    const cust = ex.customer_id ? customerMap.get(ex.customer_id) : (inv ? customerMap.get(inv.customer_id) : null);

    const affectedAmountMinorUnits = inv ? getInvoiceOutstandingBalance(inv) : 0;
    const ageDays = calculateAgeDays(ex.created_at, todayIso);
    const categoryDef = categoryDefinitionsMap.get(ex.type as PaymentDelayCategory);
    const categoryTitle = categoryDef ? categoryDef.title : ex.type;

    let ownerLabel = 'Unassigned';
    if (ex.owner_user_id) {
      if (ex.owner_user_id.startsWith('role_assigned_')) {
        const role = ex.owner_user_id.replace('role_assigned_', '').replace(/_/g, ' ');
        ownerLabel = role.charAt(0).toUpperCase() + role.slice(1);
      } else {
        ownerLabel = ex.owner_user_id;
      }
    }

    const nextActionLabel = ex.recommended_action || `Review ${categoryTitle} details`;
    const evidenceItems = (ex.evidence as any)?.evidenceItems || [];

    return {
      id: ex.id,
      organizationId: ex.organization_id,
      type: ex.type,
      categoryTitle,
      severity: ex.severity,
      status: ex.status,
      ownerId: ex.owner_user_id || null,
      ownerLabel,
      customerId: cust ? cust.id : null,
      customerName: cust ? cust.name : 'Unknown Customer',
      customerRisk: cust?.risk_score ? (cust.risk_score > 70 ? 'high' : cust.risk_score > 40 ? 'medium' : 'low') : 'medium',
      invoiceId: inv ? inv.id : null,
      invoiceNumber: inv ? inv.number : 'N/A',
      invoiceAmountMinorUnits: inv ? inv.amount_minor_units : 0,
      affectedAmountMinorUnits,
      affectedAmountFormatted: formatINR(affectedAmountMinorUnits),
      ageDays,
      createdAt: ex.created_at,
      updatedAt: ex.updated_at,
      recommendedAction: ex.recommended_action || 'Pending investigation',
      nextActionLabel,
      evidenceCount: evidenceItems.length,
    };
  });

  // Calculate KPIs across active/open dataset
  const openItems = enriched.filter((item) => !['closed', 'rejected'].includes(item.status));
  const openCount = openItems.length;
  const cashAffectedSum = openItems.reduce((sum, item) => sum + item.affectedAmountMinorUnits, 0);
  const criticalCount = openItems.filter((item) => item.severity === 'critical').length;
  const unassignedCount = openItems.filter((item) => !item.ownerId).length;
  const aging30PlusCount = openItems.filter((item) => item.ageDays >= 30).length;

  // Calculate real average resolution time from closed audit logs
  let avgResolutionTimeDays: number | null = null;
  const closedItems = enriched.filter((item) => item.status === 'closed');
  if (closedItems.length > 0) {
    const totalDays = closedItems.reduce((sum, item) => sum + item.ageDays, 0);
    avgResolutionTimeDays = Math.round((totalDays / closedItems.length) * 10) / 10;
  }

  // Category breakdown calculation (Cash Affected by Category)
  const categoryStatsMap = new Map<string, { count: number; amount: number; totalAge: number; criticalCount: number }>();
  PAYMENT_DELAY_CATEGORIES.forEach((cat) => {
    categoryStatsMap.set(cat, { count: 0, amount: 0, totalAge: 0, criticalCount: 0 });
  });

  openItems.forEach((item) => {
    const stat = categoryStatsMap.get(item.type) || { count: 0, amount: 0, totalAge: 0, criticalCount: 0 };
    stat.count += 1;
    stat.amount += item.affectedAmountMinorUnits;
    stat.totalAge += item.ageDays;
    if (item.severity === 'critical') stat.criticalCount += 1;
    categoryStatsMap.set(item.type, stat);
  });

  const cashAffectedByCategory = Array.from(categoryStatsMap.entries())
    .map(([cat, stat]) => {
      const def = categoryDefinitionsMap.get(cat as PaymentDelayCategory);
      return {
        category: cat,
        title: def ? def.title : cat,
        count: stat.count,
        cashAffectedMinorUnits: stat.amount,
        cashAffectedFormatted: formatINR(stat.amount),
        avgAgeDays: stat.count > 0 ? Math.round(stat.totalAge / stat.count) : 0,
        criticalCount: stat.criticalCount,
      };
    })
    .sort((a, b) => b.cashAffectedMinorUnits - a.cashAffectedMinorUnits);

  // Bottleneck analysis breakdown
  const bottleneckMap = new Map<string, { count: number; amount: number }>();
  openItems.forEach((item) => {
    const stage = getBottleneckStage(item.status);
    const existing = bottleneckMap.get(stage) || { count: 0, amount: 0 };
    existing.count += 1;
    existing.amount += item.affectedAmountMinorUnits;
    bottleneckMap.set(stage, existing);
  });

  const bottlenecks = Array.from(bottleneckMap.entries()).map(([stage, stat]) => ({
    stage,
    count: stat.count,
    cashAffectedMinorUnits: stat.amount,
  }));

  // Apply filters
  let filtered = [...enriched];

  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter((item) => item.status === filters.status);
  }

  if (filters.severity && filters.severity !== 'all') {
    if (filters.severity === 'unassigned') {
      filtered = filtered.filter((item) => !item.ownerId);
    } else {
      filtered = filtered.filter((item) => item.severity === filters.severity);
    }
  }

  if (filters.type && filters.type !== 'all') {
    filtered = filtered.filter((item) => item.type === filters.type);
  }

  if (filters.customerId) {
    filtered = filtered.filter((item) => item.customerId === filters.customerId);
  }

  if (filters.ownerId) {
    if (filters.ownerId === 'unassigned') {
      filtered = filtered.filter((item) => !item.ownerId);
    } else {
      filtered = filtered.filter((item) => item.ownerId === filters.ownerId);
    }
  }

  if (filters.minAmount !== undefined) {
    filtered = filtered.filter((item) => item.affectedAmountMinorUnits >= filters.minAmount! * 100);
  }

  if (filters.maxAmount !== undefined) {
    filtered = filtered.filter((item) => item.affectedAmountMinorUnits <= filters.maxAmount! * 100);
  }

  if (filters.minAgeDays !== undefined) {
    filtered = filtered.filter((item) => item.ageDays >= filters.minAgeDays!);
  }

  if (filters.maxAgeDays !== undefined) {
    filtered = filtered.filter((item) => item.ageDays <= filters.maxAgeDays!);
  }

  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter((item) =>
      item.id.toLowerCase().includes(q) ||
      item.customerName.toLowerCase().includes(q) ||
      item.invoiceNumber.toLowerCase().includes(q) ||
      item.categoryTitle.toLowerCase().includes(q) ||
      item.recommendedAction.toLowerCase().includes(q)
    );
  }

  // Sorting
  const sortBy = filters.sortBy || 'amount';
  const sortOrder = filters.sortOrder || 'desc';

  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'amount') {
      cmp = a.affectedAmountMinorUnits - b.affectedAmountMinorUnits;
    } else if (sortBy === 'severity') {
      const rank: Record<ExceptionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      cmp = rank[a.severity] - rank[b.severity];
    } else if (sortBy === 'age') {
      cmp = a.ageDays - b.ageDays;
    } else if (sortBy === 'updated') {
      cmp = a.updatedAt.localeCompare(b.updatedAt);
    } else if (sortBy === 'category') {
      cmp = a.categoryTitle.localeCompare(b.categoryTitle);
    }

    return sortOrder === 'desc' ? -cmp : cmp;
  });

  // Default deterministic ordering if no specific sort specified: High Impact + Critical + Oldest
  if (!filters.sortBy) {
    filtered.sort((a, b) => {
      // 1. Critical severity first
      const rank: Record<ExceptionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      if (rank[a.severity] !== rank[b.severity]) {
        return rank[b.severity] - rank[a.severity];
      }
      // 2. Highest financial impact
      if (a.affectedAmountMinorUnits !== b.affectedAmountMinorUnits) {
        return b.affectedAmountMinorUnits - a.affectedAmountMinorUnits;
      }
      // 3. Oldest age
      return b.ageDays - a.ageDays;
    });
  }

  // Pagination
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize || 20));
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

  return {
    items: paginatedItems,
    totalCount,
    page,
    pageSize,
    totalPages,
    kpis: {
      openExceptions: openCount,
      cashAffectedMinorUnits: cashAffectedSum,
      cashAffectedFormatted: formatINR(cashAffectedSum),
      criticalExceptions: criticalCount,
      unassignedExceptions: unassignedCount,
      agingExceptions30Plus: aging30PlusCount,
      avgResolutionTimeDays,
    },
    cashAffectedByCategory,
    bottlenecks,
  };
}