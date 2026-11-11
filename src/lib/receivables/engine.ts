// AIOSpark Receivables Intelligence Server-Side Query & Filter Engine (Layer 10)

import { udmStore } from '../udm/store';
import { Invoice, Customer, InvoiceStatus } from '../udm/types';

export interface ReceivablesQueryFilters {
  customerId?: string;
  minAmount?: number;
  maxAmount?: number;
  ageBucket?: '0-30' | '31-60' | '61-90' | '90+' | 'overdue';
  statuses?: InvoiceStatus[];
  risk?: 'high' | 'medium' | 'low'; // Interim heuristic: high = 2+ historical overdue invoices or delay > 15d
  industry?: string;
  ownerUserId?: string;
  exceptionPlaceholder?: string; // Placeholder for Layer 15 Exception Engine
  sortBy?: 'customer_name' | 'number' | 'amount' | 'due_date' | 'status' | 'risk';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ReceivablesTableItem {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerIndustry?: string | null;
  customerOwnerUserId?: string | null;
  amountMinorUnits: number;
  amountFormatted: string;
  outstandingMinorUnits: number;
  dueDate: string;
  dueDaysLabel: string; // e.g. "35d overdue" or "in 12 days"
  isOverdue: boolean;
  status: InvoiceStatus;
  risk: 'high' | 'medium' | 'low'; // Interim risk score
  exceptionStatus: string; // Placeholder "—" until Layer 15
}

export interface ReceivablesQueryResult {
  items: ReceivablesTableItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SavedFilterViewRecord {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  filter_config: ReceivablesQueryFilters;
  created_at: string;
}

/**
 * Server-side filtering, sorting, and pagination logic for Receivables Intelligence
 */
export function queryReceivablesTable(
  orgId: string,
  filters: ReceivablesQueryFilters,
  todayStr?: string
): ReceivablesQueryResult {
  udmStore.setTenantContext(orgId);
  const today = todayStr || new Date().toISOString().split('T')[0];
  const todayMs = new Date(today).getTime();

  const allInvoices = udmStore.getInvoices();
  const customersMap = new Map<string, Customer>();
  udmStore.getCustomers().forEach((c) => customersMap.set(c.id, c));

  // Compute overdue count per customer for Interim Risk Heuristic (Layer 12 placeholder)
  const customerOverdueCount = new Map<string, number>();
  for (const inv of allInvoices) {
    if (inv.due_date < today && inv.status !== 'paid' && inv.status !== 'written_off') {
      const count = customerOverdueCount.get(inv.customer_id) || 0;
      customerOverdueCount.set(inv.customer_id, count + 1);
    }
  }

  // 1. FILTER PASS
  const filtered = allInvoices.filter((inv) => {
    const cust = customersMap.get(inv.customer_id);
    const custName = cust ? cust.name : 'Unknown Customer';

    // Customer filter
    if (filters.customerId && inv.customer_id !== filters.customerId) return false;

    // Amount range filter (inputs in major currency units, e.g. ₹)
    const amountVal = inv.amount_minor_units / 100;
    if (filters.minAmount !== undefined && amountVal < filters.minAmount) return false;
    if (filters.maxAmount !== undefined && amountVal > filters.maxAmount) return false;

    // Days Overdue calculation
    const dueMs = new Date(inv.due_date).getTime();
    const daysDiff = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));

    if (filters.ageBucket) {
      if (filters.ageBucket === 'overdue' && daysDiff <= 0) return false;
      if (filters.ageBucket === '0-30' && (daysDiff < 0 || daysDiff > 30)) return false;
      if (filters.ageBucket === '31-60' && (daysDiff < 31 || daysDiff > 60)) return false;
      if (filters.ageBucket === '61-90' && (daysDiff < 61 || daysDiff > 90)) return false;
      if (filters.ageBucket === '90+' && daysDiff < 91) return false;
    }

    // Status filter (multi-select)
    if (filters.statuses && filters.statuses.length > 0) {
      if (!filters.statuses.includes(inv.status)) return false;
    }

    // Interim Risk filter
    const overdueCount = customerOverdueCount.get(inv.customer_id) || 0;
    const computedRisk: 'high' | 'medium' | 'low' = overdueCount >= 2 ? 'high' : overdueCount === 1 ? 'medium' : 'low';
    if (filters.risk && computedRisk !== filters.risk) return false;

    // Industry filter
    if (filters.industry && cust?.industry !== filters.industry) return false;

    // Owner filter
    if (filters.ownerUserId && cust?.owner_user_id !== filters.ownerUserId) return false;

    return true;
  });

  // 2. SORT PASS
  const sortBy = filters.sortBy || 'due_date';
  const sortOrder = filters.sortOrder || 'asc';
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  filtered.sort((a, b) => {
    const custA = customersMap.get(a.customer_id)?.name || '';
    const custB = customersMap.get(b.customer_id)?.name || '';

    if (sortBy === 'customer_name') {
      return custA.localeCompare(custB) * multiplier;
    }
    if (sortBy === 'number') {
      return a.number.localeCompare(b.number) * multiplier;
    }
    if (sortBy === 'amount') {
      return (a.amount_minor_units - b.amount_minor_units) * multiplier;
    }
    if (sortBy === 'due_date') {
      return (new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) * multiplier;
    }
    if (sortBy === 'status') {
      return a.status.localeCompare(b.status) * multiplier;
    }
    return 0;
  });

  // 3. PAGINATION PASS
  const totalCount = filtered.length;
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize || 20));
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedInvoices = filtered.slice(startIndex, startIndex + pageSize);

  // 4. MAP TO TABLE ITEM VIEW MODEL
  const items: ReceivablesTableItem[] = paginatedInvoices.map((inv) => {
    const cust = customersMap.get(inv.customer_id);
    const dueMs = new Date(inv.due_date).getTime();
    const daysDiff = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));
    const isOverdue = daysDiff > 0;
    const dueDaysLabel = isOverdue ? `${daysDiff}d overdue` : `in ${Math.abs(daysDiff)} days`;

    const matches = udmStore.getMatches().filter((m) => m.invoice_id === inv.id);
    const paidMatchedSum = matches.reduce((acc, m) => acc + m.matched_amount_minor_units, 0);
    const allocations = udmStore.getCreditAllocations().filter(
      (a) => a.invoice_id === inv.id && a.status === 'allocated' && a.organization_id === inv.organization_id,
    );
    const creditAllocatedSum = allocations.reduce((acc, a) => acc + a.allocated_amount_minor_units, 0);
    const outstandingMinorUnits = Math.max(0, inv.amount_minor_units - paidMatchedSum - creditAllocatedSum);

    const overdueCount = customerOverdueCount.get(inv.customer_id) || 0;
    const risk: 'high' | 'medium' | 'low' = overdueCount >= 2 ? 'high' : overdueCount === 1 ? 'medium' : 'low';

    return {
      id: inv.id,
      invoiceNumber: inv.number,
      customerId: inv.customer_id,
      customerName: cust ? cust.name : 'Unknown Customer',
      customerIndustry: cust?.industry || null,
      customerOwnerUserId: cust?.owner_user_id || null,
      amountMinorUnits: inv.amount_minor_units,
      amountFormatted: new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency }).format(
        inv.amount_minor_units / 100
      ),
      outstandingMinorUnits,
      dueDate: inv.due_date,
      dueDaysLabel,
      isOverdue,
      status: inv.status,
      risk,
      exceptionStatus: '—', // Placeholder for Layer 15 Exception Engine
    };
  });

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

class SavedFilterStore {
  private views: Map<string, SavedFilterViewRecord> = new Map();

  public saveView(orgId: string, userId: string, name: string, config: ReceivablesQueryFilters): SavedFilterViewRecord {
    const id = `sfv_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const record: SavedFilterViewRecord = {
      id,
      organization_id: orgId,
      user_id: userId,
      name,
      filter_config: config,
      created_at: new Date().toISOString(),
    };
    this.views.set(id, record);
    return record;
  }

  public getViews(orgId: string, userId: string): SavedFilterViewRecord[] {
    return Array.from(this.views.values()).filter((v) => v.organization_id === orgId && v.user_id === userId);
  }

  public clearAll(): void {
    this.views.clear();
  }
}

export const savedFilterStore = new SavedFilterStore();
