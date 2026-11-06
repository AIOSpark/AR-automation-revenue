// AIOSpark Layer 8 Data Quality Engine (Minimal Query Interface & Flag Provider)

export interface DataQualityFlag {
  id: string;
  organizationId: string;
  recordType: 'invoice' | 'customer';
  recordId: string;
  flagType: 'missing_po' | 'tax_discrepancy' | 'unverified_contact' | 'currency_ambiguity';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  createdAt: string;
}

class DataQualityStore {
  private flags: Map<string, DataQualityFlag> = new Map();

  public addFlag(flag: Omit<DataQualityFlag, 'id' | 'createdAt'>): DataQualityFlag {
    const id = `dq_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const record: DataQualityFlag = { ...flag, id, createdAt: new Date().toISOString() };
    this.flags.set(id, record);
    return record;
  }

  public getDataQualityFlag(recordType: 'invoice' | 'customer', recordId: string): DataQualityFlag | null {
    for (const flag of this.flags.values()) {
      if (flag.recordType === recordType && flag.recordId === recordId) {
        return flag;
      }
    }
    return null;
  }

  public clearAll(): void {
    this.flags.clear();
  }
}

export const dataQualityStore = new DataQualityStore();
