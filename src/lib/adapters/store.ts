// AIOSpark Integrations Database Persistence Store (Layer 5)

import { billingStore } from "../billing/store";
import { encryptSecret, decryptSecret } from "./crypto";
import { deleteSnapshot, readSnapshot, writeSnapshot } from "../db/durable-repository";

export interface IntegrationRecord {
  id: string;
  organization_id: string;
  adapter_type: "csv" | "zoho" | "tally";
  config_encrypted: string;
  status: "connected" | "syncing" | "error" | "disconnected";
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

class IntegrationsStore {
  private integrations: Map<string, IntegrationRecord> = new Map(); // Keyed by integration ID

  constructor() {
    const records = readSnapshot<IntegrationRecord[]>('integrations') || [];
    this.integrations = new Map(records.map((record) => [record.id, record]));
  }

  private persist(): void {
    writeSnapshot('integrations', Array.from(this.integrations.values()));
  }

  public saveIntegration(data: {
    organization_id: string;
    adapter_type: "csv" | "zoho" | "tally";
    rawConfig: Record<string, unknown>;
    status?: "connected" | "syncing" | "error" | "disconnected";
    last_error?: string | null;
  }): IntegrationRecord {
    const existing = this.getIntegrationByOrgAndAdapter(data.organization_id, data.adapter_type);
    const now = new Date().toISOString();
    const config_encrypted = encryptSecret(JSON.stringify(data.rawConfig));

    if (existing) {
      existing.config_encrypted = config_encrypted;
      existing.status = data.status || "connected";
      existing.last_sync_at = now;
      existing.last_error = data.last_error || null;
      existing.updated_at = now;
      this.persist();
      return existing;
    }

    const id = `int_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const record: IntegrationRecord = {
      id,
      organization_id: data.organization_id,
      adapter_type: data.adapter_type,
      config_encrypted,
      status: data.status || "connected",
      last_sync_at: now,
      last_error: data.last_error || null,
      created_at: now,
      updated_at: now,
    };

    this.integrations.set(id, record);
    this.persist();

    // Wire Layer 27 Usage Tracking Event
    billingStore.recordEvent({
      organization_id: data.organization_id,
      event_type: 'integration.connected',
      quantity: 1,
      metadata: { adapter_type: data.adapter_type },
    });

    return record;
  }

  public getIntegrationByOrgAndAdapter(orgId: string, adapterType: string): IntegrationRecord | null {
    for (const record of this.integrations.values()) {
      if (record.organization_id === orgId && record.adapter_type === adapterType) {
        return record;
      }
    }
    return null;
  }

  public getOrgIntegrations(orgId: string): IntegrationRecord[] {
    const list: IntegrationRecord[] = [];
    for (const record of this.integrations.values()) {
      if (record.organization_id === orgId) {
        list.push(record);
      }
    }
    return list;
  }

  public getDecryptedConfig(record: IntegrationRecord): Record<string, unknown> {
    try {
      const jsonStr = decryptSecret(record.config_encrypted);
      return JSON.parse(jsonStr);
    } catch {
      return {};
    }
  }

  public clearAll(): void {
    this.integrations.clear();
    deleteSnapshot('integrations');
  }
}

export const integrationsStore = new IntegrationsStore();
