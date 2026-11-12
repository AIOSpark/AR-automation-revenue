// AIOSpark Promise-to-Pay System Data Models & Store (Layer 20)
// Copyright 2026 AIOSpark. All rights reserved.

import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export type PromiseStatus = 'pending' | 'kept' | 'broken' | 'partial';

export type PromiseRecordedVia = 'manual_phone_call' | 'manual_note' | 'email_parsed' | 'whatsapp_parsed';

export interface PaymentPromise {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id?: string | null;
  promised_amount_minor_units: number;
  currency: string;
  expected_date: string; // YYYY-MM-DD
  status: PromiseStatus;
  recorded_via: PromiseRecordedVia;
  recorded_by_user_id: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  match_note?: string | null;
}

export interface CreatePromiseInput {
  organization_id: string;
  customer_id: string;
  invoice_id?: string | null;
  promised_amount_minor_units: number;
  currency?: string;
  expected_date: string;
  recorded_via: PromiseRecordedVia;
  recorded_by_user_id: string;
}

class PromiseStore {
  private promises: Map<string, PaymentPromise> = new Map();
  private gracePeriodDays: number = 2; // Configurable 1-2 days grace period

  constructor() {
    const state = readSnapshot<{ promises: PaymentPromise[]; gracePeriodDays?: number }>('promises');
    this.promises = new Map((state?.promises || []).map((promise) => [promise.id, promise]));
    this.gracePeriodDays = state?.gracePeriodDays ?? 2;
  }

  private persist(): void {
    writeSnapshot('promises', { promises: Array.from(this.promises.values()), gracePeriodDays: this.gracePeriodDays });
  }

  public setGracePeriodDays(days: number): void {
    this.gracePeriodDays = days;
    this.persist();
  }

  public getGracePeriodDays(): number {
    return this.gracePeriodDays;
  }

  /** MANUAL RECORDING ENTRY POINT
   * Strict Rule: recorded_via MUST be specified and cannot be null/undefined.
   */
  public createPromise(input: CreatePromiseInput): PaymentPromise {
    if (!input.recorded_via) {
      throw new Error("Mandatory field 'recorded_via' must be specified for manually logged promise");
    }

    const id = `prms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const promise: PaymentPromise = {
      id,
      organization_id: input.organization_id,
      customer_id: input.customer_id,
      invoice_id: input.invoice_id || null,
      promised_amount_minor_units: input.promised_amount_minor_units,
      currency: input.currency || 'INR',
      expected_date: input.expected_date,
      status: 'pending',
      recorded_via: input.recorded_via,
      recorded_by_user_id: input.recorded_by_user_id,
      created_at: now,
      updated_at: now,
      resolved_at: null,
    };

    this.promises.set(id, promise);
    this.persist();
    return promise;
  }

  /**
   * Get a promise by ID with organization scoping.
   * @param id The promise ID
   * @param orgId The organization ID - mandatory for security-sensitive lookups.
   *   Must match the promise's organization_id, or Error is thrown.
   * @returns The promise record.
   * @throws Error if the promise is not found or organization mismatch.
   */
  public getPromise(id: string, orgId: string): PaymentPromise {
    const p = this.promises.get(id);
    if (!p) throw new Error(`Promise not found: ${id}`);
    if (p.organization_id !== orgId) throw new Error(`Cross-tenant access denied: promise organization_id ${p.organization_id} does not match orgId ${orgId}`);
    return p;
  }

  public getPromises(orgId: string, customerId?: string): PaymentPromise[] {
    const list = Array.from(this.promises.values()).filter((p) => p.organization_id === orgId);
    if (customerId) {
      return list.filter((p) => p.customer_id === customerId);
    }
    return list;
  }

  public updatePromiseStatus(
    id: string,
    status: PromiseStatus,
    matchNote?: string
  ): PaymentPromise {
    const p = this.promises.get(id);
    if (!p) throw new Error(`Promise not found: ${id}`);

    const now = new Date().toISOString();
    p.status = status;
    p.updated_at = now;
    if (matchNote !== undefined) p.match_note = matchNote;

    if (status !== 'pending') {
      p.resolved_at = now;
    } else {
      p.resolved_at = null;
    }

    this.persist();

    return p;
  }

  /** COMPUTED BROKEN-PROMISE RATE STATISTICS (Trailing 12 Months)
   * Consumed by Customer 360 & Risk Engine (Layer 12).
   */
  public getBrokenPromiseStats(
    orgId: string,
    customerId: string,
    todayStr?: string
  ): {
    totalPromises: number;
    resolvedPromises: number;
    keptPromises: number;
    brokenPromises: number;
    partialPromises: number;
    brokenPromiseRate: number; // 0 to 100 percentage
  } {
    const today = todayStr || new Date().toISOString().split('T')[0];
    const todayMs = new Date(today).getTime();
    const oneYearAgoMs = todayMs - 365 * 24 * 60 * 60 * 1000;

    const custPromises = this.getPromises(orgId, customerId).filter((p) => {
      const createdMs = new Date(p.created_at).getTime();
      return createdMs >= oneYearAgoMs;
    });

    const totalPromises = custPromises.length;
    const resolvedPromises = custPromises.filter((p) => p.status !== 'pending').length;
    const keptPromises = custPromises.filter((p) => p.status === 'kept').length;
    const brokenPromises = custPromises.filter((p) => p.status === 'broken').length;
    const partialPromises = custPromises.filter((p) => p.status === 'partial').length;

    const brokenPromiseRate =
      resolvedPromises > 0 ? (brokenPromises / resolvedPromises) * 100 : 0;

    return {
      totalPromises,
      resolvedPromises,
      keptPromises,
      brokenPromises,
      partialPromises,
      brokenPromiseRate: Math.round(brokenPromiseRate),
    };
  }

  public clearAll(): void {
    this.promises.clear();
    deleteSnapshot('promises');
  }
}

export const promiseStore = new PromiseStore();