// AIOSpark Payments & Reconciliation Query & Analytics Engine
// Computes payment inflows, allocation breakdowns, unmatched cash, matching evidence, and audit trails.

import { udmStore } from '../udm/store';
import { Payment, BankTransaction, PaymentInvoiceMatch, Invoice, Customer } from '../udm/types';
import { getInvoiceOutstandingBalance } from '../dashboard/engine';
import { formatINR, calculateAgeDays } from '../exceptions/query-engine';
import { reconciliationEngine } from '../reconciliation/engine';

export interface PaymentsQueryFilters {
  status?: 'all' | 'reconciled' | 'matched' | 'partially_allocated' | 'unmatched' | 'exception';
  source?: 'all' | 'bank' | 'manual' | 'account_aggregator_api';
  customerId?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  minAgeDays?: number;
  maxAgeDays?: number;
  sortBy?: 'date' | 'amount' | 'unallocated' | 'customer';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface PaymentListItem {
  id: string;
  paymentDate: string;
  customerId: string | null;
  customerName: string;
  reference: string;
  amountMinorUnits: number;
  amountFormatted: string;
  allocatedMinorUnits: number;
  allocatedFormatted: string;
  unallocatedMinorUnits: number;
  unallocatedFormatted: string;
  status: 'reconciled' | 'matched' | 'partially_allocated' | 'unmatched' | 'exception';
  matchedInvoiceIds: string[];
  matchedInvoiceNumbers: string[];
  source: string;
  matchConfidence?: number | null;
  matchMethod?: string | null;
  rejectionReason?: string | null;
  ageDays: number;
}

export interface PaymentsQueryResult {
  items: PaymentListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kpis: {
    totalReceivedMinorUnits: number;
    totalReceivedFormatted: string;
    reconciledMinorUnits: number;
    reconciledFormatted: string;
    unmatchedMinorUnits: number;
    unmatchedFormatted: string;
    partiallyAllocatedMinorUnits: number;
    partiallyAllocatedFormatted: string;
    reconciliationExceptionsCount: number;
    todayReceivedMinorUnits: number;
    todayReceivedFormatted: string;
  };
  inflowTrend: Array<{
    period: string;
    amountMinorUnits: number;
    amountFormatted: string;
    count: number;
  }>;
  unmatchedQueue: Array<{
    transactionId: string;
    date: string;
    reference: string;
    narration: string;
    amountFormatted: string;
    reason: string;
    suggestedInvoiceId?: string | null;
    suggestedInvoiceNumber?: string | null;
    confidence?: number | null;
  }>;
}

export function queryPaymentsWorkspace(
  orgId: string,
  filters: PaymentsQueryFilters = {},
  todayStr?: string
): PaymentsQueryResult {
  udmStore.setTenantContext(orgId);
  const today = todayStr || new Date().toISOString().split('T')[0];

  const payments = udmStore.getPayments();
  const bankTxs = udmStore.getBankTransactions();
  const matches = udmStore.getMatches();
  const invoices = udmStore.getInvoices();
  const customers = udmStore.getCustomers();

  const customerMap = new Map<string, Customer>(customers.map((c) => [c.id, c]));
  const invoiceMap = new Map<string, Invoice>(invoices.map((i) => [i.id, i]));

  // Consolidate Bank Transactions & Payments into unified Payment View
  const consolidatedMap = new Map<string, PaymentListItem>();

  // 1. Process Bank Transactions
  bankTxs.forEach((tx) => {
    const matchedInvoices = (tx.matched_invoice_ids || [])
      .map((id) => invoiceMap.get(id))
      .filter((i): i is Invoice => !!i);

    const cust = matchedInvoices.length > 0 ? customerMap.get(matchedInvoices[0].customer_id) : null;
    const customerName = cust ? cust.name : 'Unidentified Customer';

    let allocatedSum = 0;
    matchedInvoices.forEach((inv) => {
      const invMatches = matches.filter((m) => m.invoice_id === inv.id);
      allocatedSum += invMatches.reduce((s, m) => s + m.matched_amount_minor_units, 0);
    });

    const unallocated = Math.max(0, tx.amount_minor_units - allocatedSum);

    let status: PaymentListItem['status'] = 'unmatched';
    if (tx.status === 'matched') {
      status = unallocated === 0 ? 'reconciled' : 'partially_allocated';
    } else if (tx.status === 'pending_approval') {
      status = 'matched';
    } else if (tx.rejection_reason) {
      status = 'exception';
    }

    consolidatedMap.set(tx.id, {
      id: tx.id,
      paymentDate: tx.date,
      customerId: cust ? cust.id : null,
      customerName,
      reference: tx.raw_reference || tx.narration_text,
      amountMinorUnits: tx.amount_minor_units,
      amountFormatted: formatINR(tx.amount_minor_units),
      allocatedMinorUnits: allocatedSum,
      allocatedFormatted: formatINR(allocatedSum),
      unallocatedMinorUnits: unallocated,
      unallocatedFormatted: formatINR(unallocated),
      status,
      matchedInvoiceIds: matchedInvoices.map((i) => i.id),
      matchedInvoiceNumbers: matchedInvoices.map((i) => i.number),
      source: tx.source_system === 'manual_upload' ? 'Bank Statement' : 'API / Aggregator',
      matchConfidence: tx.confidence || null,
      matchMethod: tx.match_method || null,
      rejectionReason: tx.rejection_reason || null,
      ageDays: calculateAgeDays(tx.date, today),
    });
  });

  // 2. Process directly ingested UDM Payments
  payments.forEach((p) => {
    if (consolidatedMap.has(p.source_id)) return; // Avoid duplicate display if already in bankTxs

    const pMatches = matches.filter((m) => m.payment_id === p.id);
    const allocatedSum = pMatches.reduce((s, m) => s + m.matched_amount_minor_units, 0);
    const unallocated = Math.max(0, p.amount_minor_units - allocatedSum);

    const matchedInvoices = pMatches
      .map((m) => invoiceMap.get(m.invoice_id))
      .filter((i): i is Invoice => !!i);

    const cust = customerMap.get(p.customer_id);

    let status: PaymentListItem['status'] = 'unmatched';
    if (allocatedSum >= p.amount_minor_units) {
      status = 'reconciled';
    } else if (allocatedSum > 0) {
      status = 'partially_allocated';
    }

    consolidatedMap.set(p.id, {
      id: p.id,
      paymentDate: p.date,
      customerId: cust ? cust.id : null,
      customerName: cust ? cust.name : 'Unknown Customer',
      reference: p.reference || p.source_id,
      amountMinorUnits: p.amount_minor_units,
      amountFormatted: formatINR(p.amount_minor_units),
      allocatedMinorUnits: allocatedSum,
      allocatedFormatted: formatINR(allocatedSum),
      unallocatedMinorUnits: unallocated,
      unallocatedFormatted: formatINR(unallocated),
      status,
      matchedInvoiceIds: matchedInvoices.map((i) => i.id),
      matchedInvoiceNumbers: matchedInvoices.map((i) => i.number),
      source: p.source_system,
      matchConfidence: 1.0,
      matchMethod: 'deterministic',
      ageDays: calculateAgeDays(p.date, today),
    });
  });

  const allItems = Array.from(consolidatedMap.values());

  // Compute KPIs
  const totalReceivedSum = allItems.reduce((s, i) => s + i.amountMinorUnits, 0);
  const reconciledSum = allItems.reduce((s, i) => s + i.allocatedMinorUnits, 0);
  const unmatchedSum = allItems.filter((i) => i.status === 'unmatched').reduce((s, i) => s + i.amountMinorUnits, 0);
  const partiallyAllocatedSum = allItems.filter((i) => i.status === 'partially_allocated').reduce((s, i) => s + i.unallocatedMinorUnits, 0);
  const reconciliationExceptionsCount = allItems.filter((i) => i.status === 'exception' || i.status === 'unmatched').length;
  const todayReceivedSum = allItems.filter((i) => i.paymentDate === today).reduce((s, i) => s + i.amountMinorUnits, 0);

  // Inflow trend calculation
  const trendMap = new Map<string, { amount: number; count: number }>();
  allItems.forEach((i) => {
    const existing = trendMap.get(i.paymentDate) || { amount: 0, count: 0 };
    existing.amount += i.amountMinorUnits;
    existing.count += 1;
    trendMap.set(i.paymentDate, existing);
  });

  const inflowTrend = Array.from(trendMap.entries())
    .map(([period, stat]) => ({
      period,
      amountMinorUnits: stat.amount,
      amountFormatted: formatINR(stat.amount),
      count: stat.count,
    }))
    .sort((a, b) => b.period.localeCompare(a.period));

  // Build Unmatched Queue with AI Suggestion
  const unmatchedQueue = allItems
    .filter((i) => i.status === 'unmatched' || i.status === 'exception')
    .map((i) => {
      // Find potential AI invoice suggestion
      const openInvoices = invoices.filter((inv) => inv.status !== 'paid');
      const textToSearch = i.reference.toLowerCase();

      let suggestedInv: Invoice | null = null;
      for (const inv of openInvoices) {
        if (textToSearch.includes(inv.number.toLowerCase()) || inv.amount_minor_units === i.amountMinorUnits) {
          suggestedInv = inv;
          break;
        }
      }

      return {
        transactionId: i.id,
        date: i.paymentDate,
        reference: i.reference,
        narration: i.reference,
        amountFormatted: i.amountFormatted,
        reason: i.rejectionReason || (i.customerId ? 'Unmatched Invoice Reference' : 'Unidentified Customer'),
        suggestedInvoiceId: suggestedInv ? suggestedInv.id : null,
        suggestedInvoiceNumber: suggestedInv ? suggestedInv.number : null,
        confidence: suggestedInv ? 0.85 : null,
      };
    });

  // Apply filters
  let filtered = [...allItems];

  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter((i) => i.status === filters.status);
  }

  if (filters.source && filters.source !== 'all') {
    filtered = filtered.filter((i) => i.source.toLowerCase().includes(filters.source!.toLowerCase()));
  }

  if (filters.customerId) {
    filtered = filtered.filter((i) => i.customerId === filters.customerId);
  }

  if (filters.minAmount !== undefined) {
    filtered = filtered.filter((i) => i.amountMinorUnits >= filters.minAmount! * 100);
  }

  if (filters.maxAmount !== undefined) {
    filtered = filtered.filter((i) => i.amountMinorUnits <= filters.maxAmount! * 100);
  }

  if (filters.minAgeDays !== undefined) {
    filtered = filtered.filter((i) => i.ageDays >= filters.minAgeDays!);
  }

  if (filters.maxAgeDays !== undefined) {
    filtered = filtered.filter((i) => i.ageDays <= filters.maxAgeDays!);
  }

  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter((i) =>
      i.customerName.toLowerCase().includes(q) ||
      i.reference.toLowerCase().includes(q) ||
      i.matchedInvoiceNumbers.some((n) => n.toLowerCase().includes(q))
    );
  }

  // Sorting
  const sortBy = filters.sortBy || 'date';
  const sortOrder = filters.sortOrder || 'desc';

  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'date') {
      cmp = a.paymentDate.localeCompare(b.paymentDate);
    } else if (sortBy === 'amount') {
      cmp = a.amountMinorUnits - b.amountMinorUnits;
    } else if (sortBy === 'unallocated') {
      cmp = a.unallocatedMinorUnits - b.unallocatedMinorUnits;
    } else if (sortBy === 'customer') {
      cmp = a.customerName.localeCompare(b.customerName);
    }
    return sortOrder === 'desc' ? -cmp : cmp;
  });

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
      totalReceivedMinorUnits: totalReceivedSum,
      totalReceivedFormatted: formatINR(totalReceivedSum),
      reconciledMinorUnits: reconciledSum,
      reconciledFormatted: formatINR(reconciledSum),
      unmatchedMinorUnits: unmatchedSum,
      unmatchedFormatted: formatINR(unmatchedSum),
      partiallyAllocatedMinorUnits: partiallyAllocatedSum,
      partiallyAllocatedFormatted: formatINR(partiallyAllocatedSum),
      reconciliationExceptionsCount,
      todayReceivedMinorUnits: todayReceivedSum,
      todayReceivedFormatted: formatINR(todayReceivedSum),
    },
    inflowTrend,
    unmatchedQueue,
  };
}
